'use strict';

const config = require('../config');
const { client } = require('../infra/redis');
const geo = require('./geo');
const rooms = require('./rooms');

/**
 * Audience et usage — DES COMPTEURS, et rien d'autre.
 *
 * Ce module est la réponse maison à « combien de monde vient, sur quelles pages,
 * d'où, et le site vit-il ? ». Il existe parce que la réponse habituelle — coller
 * une balise d'analytics — est fermée ici : le site promet publiquement qu'il ne
 * charge aucun script tiers (cf. `Confidentialite.vue`, `ChatAnonyme.vue`). Tout se
 * mesure donc côté serveur, sans une ligne de JavaScript ajoutée à la page, sans
 * cookie, et sans identifiant de visiteur.
 *
 * Quatre garde-fous portent cette promesse, et aucun n'est décoratif :
 *
 *  1. **Aucun chemin ne vient de l'utilisateur.** On ne compte que des routes
 *     DÉCLARÉES (`server/pages.js`, `server/city-pages.js`) : l'appelant résout le
 *     chemin dans cette table avant d'arriver ici. Sans cela, une URL forgée
 *     ferait pousser un hash Redis à volonté — cardinalité non bornée, et du texte
 *     étranger dans la console opérateur.
 *
 *  2. **Le comptage des visites ne retient personne.** `PFADD` sur un
 *     HyperLogLog : une esquisse probabiliste, dont on ne peut PAS ressortir les
 *     membres. Redis ne garde donc pas la liste des hashs vus, seulement de quoi
 *     en estimer le nombre. Et ce qu'on lui donne est le hash d'IP à sel ROTATIF
 *     déjà utilisé par l'anti-spam (RG-08, `security.hashIp`) : il change toutes
 *     les cinq minutes. D'où le nom retenu — « visites », pas « visiteurs
 *     uniques » : quelqu'un qui reste une heure compte plusieurs fois. C'est un
 *     choix, pas une approximation subie ; le sel quotidien qu'emploient les
 *     outils du marché donnerait le vrai unique, au prix d'une corrélation d'IP
 *     étendue de 5 minutes à 24 heures. Le chiffre exact ne vaut pas ça.
 *
 *  3. **Rien ne s'accumule.** Chaque clé porte le jour dans son nom et un TTL
 *     (`config.analytics.retentionDays`). Les statistiques vieillissent et
 *     disparaissent seules, comme le reste (RG-01).
 *
 *  4. **Les sources sont bornées.** Un hash de domaines référents est alimenté par
 *     un tiers, donc plafonné : au-delà de `maxReferrerHosts` domaines distincts
 *     dans la journée, tout va dans un seul seau `autres`.
 *
 * Ce module est PUR au sens de `domain/` : il ne connaît ni Express ni Socket.IO.
 * `index.js` lui donne un chemin déjà résolu, `admin.js` lui demande une synthèse.
 */

// Préfixes de clés. Le jour est TOUJOURS le dernier segment : une clé se lit.
const K = {
  views: 'stats:pv:', // HASH  chemin -> nombre de chargements
  visits: 'stats:visits:', // PF    esquisse des hashs d'IP du jour
  refs: 'stats:ref:', // HASH  domaine référent -> nombre d'arrivées
  messages: 'stats:msg:', // STR   enveloppes relayées (jamais leur contenu)
  notFound: 'stats:404:', // STR   requêtes tombées sur une vraie 404
  series: 'stats:ts:', // HASH  créneau du jour -> affluence échantillonnée
};

/** Seau des domaines référents au-delà du plafond, et des arrivées sans référent. */
const REF_OVERFLOW = '(autres)';
const REF_DIRECT = '(direct)';

/**
 * Un jour = une clé, dans le fuseau de l'exploitant et non en UTC : un tableau de
 * bord qui coupe ses journées à 2 h du matin est faux pour celui qui le lit. Le
 * fuseau est configurable ; s'il est invalide, on retombe sur UTC plutôt que de
 * refuser de démarrer — une statistique décalée reste préférable à un serveur mort.
 */
function makeFormatters(timeZone) {
  try {
    return {
      day: new Intl.DateTimeFormat('fr-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }),
      /**
       * `hourCycle: 'h23'` explicitement, et non `hour12: false` : selon la locale et
       * la version d'ICU, ce dernier peut retenir le cycle h24, qui écrit minuit
       * « 24:00 ». Le créneau calculé sortirait alors de la journée (288 au lieu de 0)
       * — une seule valeur fausse, à l'heure exacte où le tableau de bord change de jour.
       */
      time: new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    };
  } catch {
    console.warn(`[analytics] fuseau « ${timeZone} » inconnu — bascule sur UTC.`);
    return {
      day: new Intl.DateTimeFormat('fr-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }),
      time: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    };
  }
}

const FMT = makeFormatters(config.analytics.timeZone);

/** `2026-08-11` pour l'instant donné, dans le fuseau d'exploitation. */
function dayKey(ts = Date.now()) {
  return FMT.day.format(new Date(ts));
}

/**
 * Numéro du créneau d'échantillonnage dans la journée locale. Le pas vient de
 * `sampleMs` : à 5 minutes, 288 créneaux — le hash d'un jour est borné par
 * construction, il ne peut pas grossir même si l'échantillonneur s'emballe.
 */
function slotOf(ts = Date.now()) {
  const [h, m] = FMT.time.format(new Date(ts)).split(':').map(Number);
  return Math.floor(((h * 60 + m) * 60000) / config.analytics.sampleMs);
}

function slotsPerDay() {
  return Math.max(1, Math.round(86400000 / config.analytics.sampleMs));
}

/** Les `n` derniers jours, du plus ancien au plus récent (bornes incluses). */
function lastDays(n, ts = Date.now()) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) out.push(dayKey(ts - i * 86400000));
  return out;
}

/** TTL commun à toutes les clés du jour : la rétention, en secondes. */
function retentionSec() {
  return Math.max(1, config.analytics.retentionDays) * 86400;
}

/**
 * Pose le TTL sans condition. `EXPIRE` sur une clé qui en a déjà un le REMPLACE :
 * la fenêtre glisse donc avec la dernière écriture du jour plutôt que de partir de
 * la première. C'est l'effet voulu — une journée expire au plus tôt N jours après
 * s'être terminée, jamais pendant qu'on l'alimente encore.
 */
async function touchTtl(key) {
  await client.expire(key, retentionSec());
}

/**
 * Un chargement de page. `path` DOIT être une route déclarée — l'appelant l'a
 * résolue, ce module ne revalide pas ce qu'il ne peut pas connaître (la table des
 * pages appartient à la couche HTTP).
 *
 * `ipHash` est le hash à sel rotatif de `security.hashIp`, jamais une IP. Absent,
 * la visite n'est pas comptée : mieux vaut un chiffre un peu bas qu'un chiffre
 * fabriqué.
 *
 * `referrerHost` est déjà normalisé (hôte seul, minuscules, sans `www.`) ou vide
 * pour une arrivée directe.
 */
async function recordPageView({ path, ipHash, referrerHost, ts = Date.now() } = {}) {
  if (!config.analytics.enabled || !path) return;
  const day = dayKey(ts);

  // Les trois compteurs sont indépendants : les mener de front ramène le coût d'un
  // chargement de huit allers-retours Redis enchaînés à trois. Chacun reste
  // séquentiel en interne, l'`EXPIRE` devant suivre l'écriture qui crée la clé.
  await Promise.all([
    (async () => {
      const key = `${K.views}${day}`;
      await client.hIncrBy(key, path, 1);
      await touchTtl(key);
    })(),
    (async () => {
      if (!ipHash) return;
      const key = `${K.visits}${day}`;
      await client.pfAdd(key, ipHash);
      await touchTtl(key);
    })(),
    recordReferrer(referrerHost, day),
  ]);
}

/**
 * Provenance. Le plafond se vérifie AVANT d'ouvrir un champ neuf, et jamais pour un
 * champ déjà connu : sans cette nuance, une fois le plafond atteint, les domaines
 * déjà comptés cesseraient d'avancer et le classement se figerait sur la matinée.
 */
async function recordReferrer(host, day) {
  const key = `${K.refs}${day}`;
  const field = host || REF_DIRECT;

  let target = field;
  if (field !== REF_DIRECT) {
    const known = await client.hGet(key, field);
    if (known == null && (await client.hLen(key)) >= config.analytics.maxReferrerHosts) {
      target = REF_OVERFLOW;
    }
  }

  await client.hIncrBy(key, target, 1);
  await touchTtl(key);
}

/**
 * Une enveloppe relayée. Le serveur compte ce qui passe par lui, il ne l'ouvre pas :
 * ce compteur ne dit rien du contenu, du salon ni de l'auteur — juste que la
 * plateforme a servi à quelque chose ce jour-là.
 */
async function recordMessage(ts = Date.now()) {
  if (!config.analytics.enabled) return;
  const key = `${K.messages}${dayKey(ts)}`;
  await client.incr(key);
  await touchTtl(key);
}

/**
 * Une vraie 404. Signal d'exploitation, pas d'audience : une hausse soudaine trahit
 * un lien externe cassé ou une page retirée de la sélection sans redirection.
 */
async function recordNotFound(ts = Date.now()) {
  if (!config.analytics.enabled) return;
  const key = `${K.notFound}${dayKey(ts)}`;
  await client.incr(key);
  await touchTtl(key);
}

/**
 * Relevé d'affluence. Une JAUGE, écrite avec `hSet` et non `hIncrBy` : plusieurs
 * instances échantillonnent le même Redis et y lisent donc le même état global.
 * Écrire la valeur observée les rend idempotentes (la dernière gagne, et elles
 * disent la même chose) ; un incrément, lui, multiplierait l'affluence par le
 * nombre d'instances.
 */
async function sampleTraffic(ts = Date.now()) {
  if (!config.analytics.enabled) return null;
  const [sessions, roomList] = await Promise.all([geo.presenceCount(), rooms.listAll()]);
  const members = roomList.reduce((sum, r) => sum + (r.count || 0), 0);

  const point = { sessions, rooms: roomList.length, members };
  const key = `${K.series}${dayKey(ts)}`;
  await client.hSet(key, String(slotOf(ts)), `${sessions},${roomList.length},${members}`);
  await touchTtl(key);
  return point;
}

/** `"12,3,25"` -> `{ sessions, rooms, members }`, tolérant à une valeur abîmée. */
function parsePoint(raw) {
  const [sessions, roomCount, members] = String(raw || '').split(',').map(Number);
  return {
    sessions: Number.isFinite(sessions) ? sessions : 0,
    rooms: Number.isFinite(roomCount) ? roomCount : 0,
    members: Number.isFinite(members) ? members : 0,
  };
}

/** Somme des valeurs d'un hash Redis (toutes numériques par construction). */
function sumHash(hash) {
  return Object.values(hash || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

/** Cumule `source` dans `into` (agrégation d'un hash journalier sur la fenêtre). */
function mergeInto(into, source) {
  for (const [field, value] of Object.entries(source || {})) {
    into[field] = (into[field] || 0) + (Number(value) || 0);
  }
}

/** Un objet {clé: nombre} en tableau trié décroissant, tronqué à `limit`. */
function topOf(counts, limit) {
  return Object.entries(counts)
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key, 'fr'))
    .slice(0, limit);
}

// Combien de jours de série fine on renvoie au client. Au-delà, la courbe compte
// des milliers de points pour une largeur d'écran qui n'en montrera jamais autant :
// les jours plus anciens ne gardent que leur pic et leur moyenne.
const FINE_SERIES_DAYS = 2;

// Plafonds d'affichage : au-delà, un classement n'informe plus, il encombre.
const TOP_PAGES = 15;
const TOP_REFERRERS = 15;

/**
 * Synthèse pour la console opérateur. Lecture seule, à la demande — jamais sur le
 * tick de 5 s du tableau de bord : elle balaye toute la fenêtre, alors que les
 * chiffres qu'elle rend ne bougent qu'à l'échelle de la journée.
 */
async function summary({ days = 7, now = Date.now() } = {}) {
  const window = Math.min(Math.max(1, Math.floor(days) || 1), config.analytics.retentionDays);
  const dayKeys = lastDays(window, now);

  const perDay = await Promise.all(
    dayKeys.map(async (day) => {
      const [views, visits, refs, messages, notFound, series] = await Promise.all([
        client.hGetAll(`${K.views}${day}`),
        client.pfCount(`${K.visits}${day}`),
        client.hGetAll(`${K.refs}${day}`),
        client.get(`${K.messages}${day}`),
        client.get(`${K.notFound}${day}`),
        client.hGetAll(`${K.series}${day}`),
      ]);

      const points = Object.entries(series || {}).map(([slot, raw]) => ({
        slot: Number(slot),
        ...parsePoint(raw),
      }));
      points.sort((a, b) => a.slot - b.slot);

      return {
        day,
        views: sumHash(views),
        visits: Number(visits) || 0,
        messages: Number(messages) || 0,
        notFound: Number(notFound) || 0,
        peakSessions: points.reduce((max, p) => Math.max(max, p.sessions), 0),
        byPath: views || {},
        byReferrer: refs || {},
        points,
      };
    }),
  );

  const pages = {};
  const referrers = {};
  for (const d of perDay) {
    mergeInto(pages, d.byPath);
    mergeInto(referrers, d.byReferrer);
  }

  const totals = perDay.reduce(
    (acc, d) => ({
      views: acc.views + d.views,
      visits: acc.visits + d.visits,
      messages: acc.messages + d.messages,
      notFound: acc.notFound + d.notFound,
      peakSessions: Math.max(acc.peakSessions, d.peakSessions),
    }),
    { views: 0, visits: 0, messages: 0, notFound: 0, peakSessions: 0 },
  );

  return {
    ts: now,
    // Le client a besoin du pas pour replacer un créneau sur l'axe des heures.
    window,
    sampleMs: config.analytics.sampleMs,
    slotsPerDay: slotsPerDay(),
    retentionDays: config.analytics.retentionDays,
    timeZone: config.analytics.timeZone,
    totals,
    // Série journalière : ce qui porte la tendance, donc le cœur du tableau.
    daily: perDay.map(({ day, views, visits, messages, notFound, peakSessions }) => ({
      day,
      views,
      visits,
      messages,
      notFound,
      peakSessions,
    })),
    pages: topOf(pages, TOP_PAGES),
    referrers: topOf(referrers, TOP_REFERRERS),
    // Courbe d'affluence fine, sur les derniers jours seulement.
    series: perDay.slice(-FINE_SERIES_DAYS).map(({ day, points }) => ({ day, points })),
  };
}

module.exports = {
  recordPageView,
  recordMessage,
  recordNotFound,
  sampleTraffic,
  summary,
  // Exportés pour les tests et pour l'échantillonneur de `index.js`.
  dayKey,
  slotOf,
  lastDays,
  K,
  REF_DIRECT,
  REF_OVERFLOW,
};
