'use strict';

const { client } = require('../infra/redis');
const config = require('../config');
const { genId } = require('../protocol');

/**
 * Socle de modération (conformité DSA/RGPD).
 *
 * Ne connaît PAS Socket.IO. Tout l'état est volatil en Redis avec TTL et ne
 * contient JAMAIS d'IP ni de coordonnées (RG-08, §5.1).
 *
 * État Redis :
 *  - hash `mod:report:<id>`    : un signalement, copie FIGÉE et AUTOSUFFISANTE
 *                               (pseudo + contenu + horodatage snapshotés), TTL court ;
 *  - zset `mod:reports`        : index des signalements, score = horodatage ;
 *  - set  `mod:dedup:<msgId>`  : signaleurs déjà comptés (1 signaleur = 1 report / message) ;
 *  - set  `mod:bans`           : exclusion volatile best-effort (RG-08 : pas d'identifiant durable) ;
 *  - hash `mod:incident:<id>`  : incident de réquisition PROSPECTIVE (jamais rétroactif).
 */

const REPORT_KEY = (id) => `mod:report:${id}`;
const REPORTS_INDEX = 'mod:reports';
const DEDUP_KEY = (messageId) => `mod:dedup:${messageId}`;
const BANS_KEY = 'mod:bans';
const INCIDENT_KEY = (id) => `mod:incident:${id}`;

/** Motifs de signalement reconnus ; `minor` est prioritaire (DSA art.28). */
const REASONS = new Set(['illegal', 'minor', 'harassment', 'spam', 'other']);

/** Normalisation insensible à la casse ET aux accents (NFD + suppression des diacritiques). */
const fold = (s) =>
  String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

// Paires { original, folded } pour un filtre insensible casse/accents sans désalignement d'index.
const KEYWORDS = config.moderation.keywords
  .map((original) => ({ original, folded: fold(original) }))
  .filter((k) => k.folded);

// ==========================================================================
// SIGNALEMENTS (DSA art.16 notice-and-action)
// ==========================================================================

/**
 * Crée un signalement à partir d'une copie autosuffisante fournie par l'appelant.
 * Le contenu et les pseudos sont SNAPSHOTÉS : un signalement reste consultable même
 * après la destruction de la session de l'auteur (RG-02). Aucune lecture de `sessions`.
 *
 * Déduplication : un même signaleur (`reporterId`) ne crée qu'un signalement par
 * `messageId`. Renvoie `null` si le signalement est un doublon.
 *
 * @returns {Promise<object|null>} le signalement créé, ou `null` si doublon.
 */
async function createReport(report = {}) {
  // Déduplication best-effort (le reporterId, volatil, n'est PAS stocké dans le report).
  if (report.messageId && report.reporterId) {
    const added = await client.sAdd(DEDUP_KEY(report.messageId), report.reporterId);
    await client.expire(DEDUP_KEY(report.messageId), config.ttl.reportSec);
    if (added === 0) return null; // déjà signalé par ce signaleur
  }

  const id = genId();
  const ts = Number.isFinite(report.ts) ? Number(report.ts) : Date.now();
  const source = report.source || 'reporter';

  const record = {
    id,
    scope: report.scope === 'pm' ? 'pm' : 'room',
    roomId: report.roomId || '',
    messageId: report.messageId || '',
    content: report.content == null ? '' : String(report.content),
    authorId: report.authorId || '',
    authorPseudo: report.authorPseudo || '',
    reporterPseudo: report.reporterPseudo || '',
    reason: REASONS.has(report.reason) ? report.reason : 'other',
    source,
    // Authenticité non garantie sauf si le serveur a lui-même vu le texte (filtre).
    unverified: source === 'filter' ? '' : '1',
    ts: String(ts),
  };

  await client.hSet(REPORT_KEY(id), record);
  await client.expire(REPORT_KEY(id), config.ttl.reportSec);
  await client.zAdd(REPORTS_INDEX, { score: ts, value: id });
  await client.expire(REPORTS_INDEX, config.ttl.reportSec);

  return toReport(record);
}

/** Hash brut Redis -> objet signalement typé. JAMAIS de champ `ip`. */
function toReport(h) {
  if (!h || !h.id) return null;
  return {
    id: h.id,
    scope: h.scope,
    roomId: h.roomId || null,
    messageId: h.messageId || null,
    content: h.content,
    authorId: h.authorId || null,
    authorPseudo: h.authorPseudo || null,
    reporterPseudo: h.reporterPseudo || null,
    reason: h.reason,
    source: h.source,
    unverified: h.unverified === '1',
    ts: Number(h.ts),
  };
}

async function getReport(id) {
  return toReport(await client.hGetAll(REPORT_KEY(id)));
}

/**
 * Signalements les plus récents d'abord. Nettoie au passage les entrées d'index
 * dont le hash a expiré (nettoyage paresseux, comme `rooms.listPublic`).
 */
async function listReports(limit = 50) {
  const ids = await client.zRange(REPORTS_INDEX, 0, -1); // tri par score (ts) croissant
  ids.reverse(); // plus récent d'abord
  const out = [];
  for (const id of ids) {
    if (out.length >= limit) break;
    const report = await getReport(id);
    if (!report) {
      await client.zRem(REPORTS_INDEX, id); // hash expiré -> on purge l'index
      continue;
    }
    out.push(report);
  }
  return out;
}

async function deleteReport(id) {
  await client.del(REPORT_KEY(id));
  await client.zRem(REPORTS_INDEX, id);
}

// ==========================================================================
// FILTRE DE MOTS-CLÉS — non bloquant, salons publics uniquement (RG-07)
// ==========================================================================

/**
 * Analyse un texte de salon public. NE BLOQUE JAMAIS la diffusion : sert seulement
 * à marquer/signaler. Insensible à la casse et aux accents. N'est jamais appliqué aux MP.
 * @returns {{ flagged: boolean, terms: string[] }}
 */
function scanText(text) {
  if (KEYWORDS.length === 0) return { flagged: false, terms: [] };
  const folded = fold(text);
  const terms = [];
  for (const k of KEYWORDS) {
    if (folded.includes(k.folded)) terms.push(k.original);
  }
  return { flagged: terms.length > 0, terms };
}

// ==========================================================================
// EXCLUSION VOLATILE — best-effort (RG-08 : aucun identifiant durable)
// ==========================================================================

async function banSession(sessionId) {
  await client.sAdd(BANS_KEY, sessionId);
  await client.expire(BANS_KEY, config.ttl.banSec);
}

async function isBanned(sessionId) {
  return !!(await client.sIsMember(BANS_KEY, sessionId));
}

async function unbanSession(sessionId) {
  await client.sRem(BANS_KEY, sessionId);
}

// ==========================================================================
// INCIDENT DE RÉQUISITION — préservation PROSPECTIVE uniquement (jamais rétroactif)
// ==========================================================================

async function openIncident(reason) {
  const id = genId();
  await client.hSet(INCIDENT_KEY(id), {
    id,
    reason: reason == null ? '' : String(reason),
    openedAt: String(Date.now()),
    saltFrozen: '1',
  });
  await client.expire(INCIDENT_KEY(id), config.ttl.incidentSec);
  return { id };
}

async function getIncident(id) {
  const h = await client.hGetAll(INCIDENT_KEY(id));
  if (!h || !h.id) return null;
  return {
    id: h.id,
    reason: h.reason || '',
    openedAt: Number(h.openedAt),
    saltFrozen: h.saltFrozen === '1',
  };
}

async function closeIncident(id) {
  await client.del(INCIDENT_KEY(id));
}

module.exports = {
  createReport,
  getReport,
  listReports,
  deleteReport,
  scanText,
  banSession,
  isBanned,
  unbanSession,
  openIncident,
  getIncident,
  closeIncident,
  genId,
};
