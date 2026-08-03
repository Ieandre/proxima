'use strict';

const { client } = require('../infra/redis');
const geo = require('./geo');
const config = require('../config');

/**
 * Identité de session — volatile, liée à la session navigateur (RG-01, RG-02).
 * Stockée dans un hash Redis `sess:<id>` à TTL court, rafraîchi par heartbeat.
 * Aucune PII : pseudo + âge + ville déclarés uniquement (§2.1).
 */
const key = (id) => `sess:${id}`;

async function createSession(id, data) {
  const k = key(id);
  await client.hSet(k, {
    pseudo: data.pseudo,
    age: String(data.age),
    gender: data.gender, // 'F' | 'H' | 'A'
    city: data.city,
    region: data.region || '',
    country: data.country || '',
    countryLabel: data.countryLabel || '',
    lon: String(data.lon),
    lat: String(data.lat),
    pub: data.pub || '', // clé publique E2E (relais uniquement, §4.4)
  });
  await client.expire(k, config.ttl.sessionSec);
}

/** Rafraîchit le TTL (heartbeat). Renvoie false si la session a déjà expiré. */
async function touch(id) {
  const ok = await client.expire(key(id), config.ttl.sessionSec);
  return ok === 1 || ok === true;
}

/**
 * Renomme une session en cours. `hSet` ne touche pas au TTL : l'identité reste
 * exactement aussi volatile qu'avant (RG-01). Renvoie false si la session a
 * expiré entre-temps — on ne ressuscite pas un hash disparu.
 */
async function setPseudo(id, pseudo) {
  const k = key(id);
  // Même critère d'existence que `getSession` : un hash sans pseudo n'est pas une
  // session. Évite de recréer un hash sans TTL pour une session déjà expirée.
  if (!(await client.hGet(k, 'pseudo'))) return false;
  await client.hSet(k, { pseudo });
  return true;
}

async function getSession(id) {
  const h = await client.hGetAll(key(id));
  if (!h || !h.pseudo) return null;
  return {
    id,
    pseudo: h.pseudo,
    age: Number(h.age),
    gender: h.gender || 'A',
    city: h.city,
    region: h.region,
    country: h.country,
    countryLabel: h.countryLabel,
    lon: Number(h.lon),
    lat: Number(h.lat),
    pub: h.pub,
  };
}

/** Profil exposable aux autres : aucune coordonnée précise, aucune IP. */
function toPublic(s) {
  if (!s) return null;
  return {
    id: s.id,
    pseudo: s.pseudo,
    age: s.age,
    gender: s.gender,
    city: s.city,
    region: s.region,
    country: s.country,
    countryLabel: s.countryLabel,
    pub: s.pub,
  };
}

async function getPublicProfile(id) {
  return toPublic(await getSession(id));
}

/**
 * Construit les profils publics d'une liste d'ids en nettoyant au passage les
 * « fantômes » (sessions expirées encore présentes dans l'index GEO).
 */
async function publicProfiles(ids) {
  const out = [];
  for (const id of ids) {
    const s = await getSession(id);
    if (!s) {
      await geo.removePresence(id); // nettoyage paresseux
      continue;
    }
    out.push(toPublic(s));
  }
  return out;
}

async function deleteSession(id) {
  await client.del(key(id));
  await geo.removePresence(id);
}

module.exports = {
  createSession,
  touch,
  setPseudo,
  getSession,
  getPublicProfile,
  publicProfiles,
  deleteSession,
  toPublic,
};
