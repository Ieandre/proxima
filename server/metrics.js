'use strict';

const { client } = require('./infra/redis');
const geo = require('./domain/geo');
const rooms = require('./domain/rooms');
const moderation = require('./domain/moderation');
const security = require('./security');

/**
 * Métriques AGRÉGÉES pour le tableau de bord de la console opérateur (`/admin`).
 *
 * Contrainte cardinale (l'âme du projet) : ce module ne renvoie QUE des compteurs
 * anonymes. JAMAIS de PII, jamais d'IP, jamais de pseudo, jamais de coordonnée,
 * jamais d'identifiant de session ou de salon — uniquement des dénombrements.
 * Il n'écrit rien : lecture seule d'un état déjà volatil (Redis à TTL).
 *
 * Il ne connaît PAS Socket.IO (comme `moderation.js`) : `admin.js` l'appelle et
 * diffuse le résultat. Testable isolément avec le fake-Redis injecté.
 */

// Plafond de signalements agrégés (aligné sur la rétention courte, faible volume attendu).
const REPORT_SCAN_LIMIT = 200;

/**
 * Instantané agrégé de l'état courant de la plateforme.
 * @returns {Promise<object>} compteurs uniquement (aucune donnée nominative).
 */
async function snapshot() {
  const [sessions, publicRooms, reports, onion] = await Promise.all([
    geo.presenceCount(),
    rooms.listPublic(),
    moderation.listReports(REPORT_SCAN_LIMIT),
    security.onionCounters(),
  ]);

  const roomAgg = { total: publicRooms.length, members: 0, encrypted: 0, permanent: 0 };
  for (const r of publicRooms) {
    roomAgg.members += r.count || 0;
    if (r.encrypted) roomAgg.encrypted += 1;
    if (r.persistent) roomAgg.permanent += 1;
  }

  // `priority` = motifs prioritaires DSA (mineur en danger / contenu illégal) ;
  // `auto` = détectés par le filtre de mots-clés (salons publics uniquement, RG-07).
  const reportAgg = { total: reports.length, priority: 0, auto: 0, byReason: {} };
  for (const rep of reports) {
    if (rep.reason === 'minor' || rep.reason === 'illegal') reportAgg.priority += 1;
    if (rep.source === 'filter') reportAgg.auto += 1;
    reportAgg.byReason[rep.reason] = (reportAgg.byReason[rep.reason] || 0) + 1;
  }

  return {
    ts: Date.now(),
    sessions,
    rooms: roomAgg,
    reports: reportAgg,
    saltFrozen: security.isSaltFrozen(),
    /**
     * Service onion — deux nombres, aucune PII.
     *  - `globalRateLimited` : déclenchements du plafond global. Sert à régler le
     *    dimensionnement (×50 posé à l'intuition) sur des faits.
     *  - `unmarkedLoopback` : connexions loopback SANS le marqueur alors qu'un onion
     *    est annoncé. Toute valeur non nulle signifie que le bloc onion du Caddyfile
     *    ne s'applique pas, et donc que le trafic Tor partage un seul compteur.
     */
    onion,
    // `isReady` est faux si la connexion applicative Redis est rompue (transitoire).
    redisOk: client.isReady !== false,
    uptimeSec: Math.floor(process.uptime()),
  };
}

module.exports = { snapshot };
