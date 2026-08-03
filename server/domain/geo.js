'use strict';

const { client } = require('../infra/redis');
const config = require('../config');

/**
 * Présence de proximité via l'index géospatial Redis (§4.2, §5.2).
 * Chaque session est un membre de l'ensemble GEO `presence`, positionné sur
 * les coordonnées de sa ville déclarée (jamais une position GPS réelle, §2.2).
 */
const KEY = 'presence';

async function addPresence(sessionId, lon, lat) {
  await client.geoAdd(KEY, { longitude: lon, latitude: lat, member: sessionId });
}

async function removePresence(sessionId) {
  await client.zRem(KEY, sessionId);
}

/**
 * Identifiants des sessions situées dans le rayon (75 km par défaut) autour de
 * la session donnée, soi-même exclu. Renvoie [] si la session n'est plus indexée.
 */
async function nearbyIds(sessionId, radiusKm = config.radiusKm) {
  let ids;
  try {
    // node-redis : pour FROMMEMBER, `from` est la chaîne du membre (pas un objet).
    ids = await client.geoSearch(KEY, sessionId, { radius: radiusKm, unit: 'km' });
  } catch (err) {
    // FROMMEMBER lève une erreur si le membre n'existe pas/plus (session expirée).
    if (/could not (be found|decode)/i.test(err.message)) return [];
    throw err;
  }
  return ids.filter((id) => id !== sessionId);
}

/**
 * Nombre de sessions actuellement indexées (présentes). Agrégat pur, sans PII :
 * l'index GEO reposant sur un zset, `ZCARD` en donne le cardinal. Peut compter
 * quelques « fantômes » (sessions expirées non encore purgées paresseusement),
 * borne haute acceptable pour un simple indicateur de charge.
 */
async function presenceCount() {
  return client.zCard(KEY);
}

module.exports = { addPresence, removePresence, nearbyIds, presenceCount, KEY };
