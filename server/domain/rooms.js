'use strict';

const crypto = require('crypto');
const { client } = require('../infra/redis');
const { genId } = require('../protocol');
const sessions = require('./sessions');
const config = require('../config');

/**
 * Salons publics/privés (§2.4). État volatil en Redis :
 *  - hash  `room:<id>`         : métadonnées (nom, type, propriétaire, mot de passe haché, jeton d'invitation) ;
 *  - zset  `room:<id>:members` : membres, score = ordre d'arrivée (pour le transfert de propriété RG-06) ;
 *  - set   `rooms:pub`         : index des salons publics (pour le listing).
 */
const roomKey = (id) => `room:${id}`;
const membersKey = (id) => `room:${id}:members`;
const PUBLIC_INDEX = 'rooms:pub';

let joinCounter = 0;
const nextScore = () => Date.now() * 1000 + (joinCounter++ % 1000);

/**
 * Projection PUBLIQUE d'un salon — ce qu'un client a le droit de connaître.
 * Miroir de `sessions.toPublic()`, et pour la même raison : la frontière entre
 * l'enregistrement Redis et ce qui part sur le fil doit être déclarée à un seul
 * endroit. Ce qui est tu ici est aussi important que ce qui est exposé : ni
 * `owner`, ni `pass`, ni `invite`, ni `verifier` (la preuve d'accès E2E).
 */
function toPublic(room) {
  if (!room) return null;
  return {
    id: room.id,
    name: room.name,
    type: room.type,
    hasPassword: room.hasPassword,
    encrypted: room.encrypted,
    // Sel Argon2id public, exposé seulement pour un salon chiffré (sert à dériver la clé côté client).
    salt: room.encrypted ? room.salt : undefined,
  };
}

function hashPassword(salt, password) {
  return crypto.createHash('sha256').update(salt).update(password).digest('base64url');
}

async function createRoom({ name, type, password, ownerId, encrypted, verifier, salt }) {
  const id = genId(8);
  const invite = genId(16);
  const isEncrypted = !!encrypted;
  const isPrivate = type === 'private' || isEncrypted; // un salon chiffré est toujours privé
  // Salon chiffré : le sel Argon2id (16 o) est fourni PAR LE CLIENT et public ; sinon sel SHA-256 interne.
  const roomSalt = isEncrypted ? salt : genId(8);
  await client.hSet(roomKey(id), {
    name,
    type: isPrivate ? 'private' : 'public',
    owner: ownerId,
    invite,
    salt: roomSalt,
    // `pass` (hash SHA-256) seulement pour un privé NON chiffré ; `verifier` (preuve E2E) seulement si chiffré.
    pass: !isEncrypted && isPrivate && password ? hashPassword(roomSalt, password) : '',
    verifier: isEncrypted ? verifier : '',
    encrypted: isEncrypted ? '1' : '',
    createdAt: String(nextScore()),
  });
  await client.expire(roomKey(id), config.ttl.roomSec);
  await addMember(id, ownerId);
  // Visibilité : publics ET chiffrés sont listés (nom + cadenas) ;
  // un privé sur invitation non chiffré reste hors index.
  if (!isPrivate || isEncrypted) await client.sAdd(PUBLIC_INDEX, id);
  return { id, invite };
}

/**
 * Salon PERMANENT : défini par l'opérateur, jamais expiré,
 * jamais purgé quand vide (exception à RG-05) et sans transfert de propriété
 * (owner=system, exception à RG-06). Clé déterministe `room:<slug>` ; aucun
 * membre n'est ajouté à la création (un permanent existe vide).
 */
async function createPersistentRoom({ slug, name }) {
  await client.hSet(roomKey(slug), {
    name,
    type: 'public',
    owner: 'system',
    persistent: '1',
    createdAt: String(nextScore()),
  });
  // Volontairement AUCUN `expire` : un salon permanent ne doit jamais expirer.
  await client.sAdd(PUBLIC_INDEX, slug);
  return { id: slug };
}

/** Prédicat unique consulté par les call sites de cycle de vie (TTL / RG-05 / RG-06). */
function isPersistentRoom(room) {
  return !!room && room.persistent === true;
}

/** Préfixe des salons de région, commun à la fabrique et au prédicat. */
const REGION_PREFIX = 'rgn-';

/**
 * Identifiant déterministe du salon de région : `rgn-<cc>-<code>`
 * (ex. `rgn-fr-11`, `rgn-ch-ge`). Le code pays préfixe garantit qu'un même code de
 * région dans deux pays donne deux salons distincts. Les codes admin1 étant courts
 * (≤ 3 caractères), le slug reste très en deçà de la limite de 32.
 */
function regionRoomId(country, code) {
  const cc = String(country || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const rc = String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${REGION_PREFIX}${cc}-${rc}`;
}

/**
 * Vrai si l'id désigne un salon de région (arrivée AUTOMATIQUE). Sert à taire le
 * message système « est sorti·e », qui n'a pas de sens quand l'entrée et la sortie
 * ne sont pas des gestes — même pour qui a parlé dans le salon. Les arrivées, elles,
 * ne sont annoncées dans AUCUN salon.
 */
function isRegionRoomId(id) {
  return typeof id === 'string' && id.startsWith(REGION_PREFIX);
}

/**
 * Garantit l'existence du salon PERMANENT de la région et renvoie son slug.
 * Créé à la volée au premier arrivant d'une région, puis
 * réutilisé (jamais recréé — comme le seed des permanents). Renvoie `null` si la
 * région n'est pas résolue (pas de rattachement possible). Sûr en multi-instance :
 * `getRoom` + `createPersistentRoom` convergent (hSet/sAdd idempotents).
 */
async function ensureRegionRoom({ country, code, name }) {
  if (!code || !name) return null;
  const slug = regionRoomId(country, code);
  if (!(await getRoom(slug))) {
    await createPersistentRoom({ slug, name });
  }
  return slug;
}

/** Renomme un salon (libellé affiché) — utilisé par la console opérateur. */
async function setName(id, name) {
  await client.hSet(roomKey(id), 'name', name);
}

async function getRoom(id) {
  const h = await client.hGetAll(roomKey(id));
  if (!h || !h.name) return null;
  return {
    id,
    name: h.name,
    type: h.type,
    owner: h.owner,
    invite: h.invite,
    hasPassword: !!h.pass,
    // Salon chiffré E2E : flag + sel Argon2id public exposés ; `verifier` JAMAIS exposé.
    encrypted: h.encrypted === '1',
    salt: h.salt || '',
    persistent: h.persistent === '1',
  };
}

async function addMember(id, sessionId) {
  await client.zAdd(membersKey(id), { score: nextScore(), value: sessionId });
  // Un salon permanent n'expire jamais : on ne réarme aucun TTL à l'arrivée d'un membre.
  if ((await client.hGet(roomKey(id), 'persistent')) === '1') return;
  await client.expire(membersKey(id), config.ttl.roomSec);
  await client.expire(roomKey(id), config.ttl.roomSec);
}

async function removeMember(id, sessionId) {
  await client.zRem(membersKey(id), sessionId);
}

async function isMember(id, sessionId) {
  const score = await client.zScore(membersKey(id), sessionId);
  return score !== null && score !== undefined;
}

/** Membres ordonnés par ancienneté (le plus ancien d'abord) — base du transfert RG-06. */
async function memberIds(id) {
  return client.zRange(membersKey(id), 0, -1);
}

async function memberCount(id) {
  return client.zCard(membersKey(id));
}

/** Liste des membres en profils publics, nettoyage des fantômes inclus. */
async function memberProfiles(id) {
  const ids = await memberIds(id);
  const out = [];
  for (const sid of ids) {
    const p = await sessions.getPublicProfile(sid);
    if (!p) {
      await removeMember(id, sid); // session expirée -> on l'ôte du salon
      continue;
    }
    out.push({ id: p.id, pseudo: p.pseudo });
  }
  return out;
}

async function ownerOf(id) {
  return client.hGet(roomKey(id), 'owner');
}

async function setOwner(id, sessionId) {
  await client.hSet(roomKey(id), 'owner', sessionId);
}

async function setPassword(id, password) {
  const salt = await client.hGet(roomKey(id), 'salt');
  await client.hSet(roomKey(id), 'pass', password ? hashPassword(salt, password) : '');
}

async function verifyPassword(id, password) {
  const h = await client.hmGet(roomKey(id), ['salt', 'pass']);
  const [salt, pass] = h;
  if (!pass) return true; // pas de mot de passe défini
  return hashPassword(salt, password || '') === pass;
}

async function verifyInvite(id, token) {
  const invite = await client.hGet(roomKey(id), 'invite');
  if (!token || !invite) return false;
  // Comparaison à TEMPS CONSTANT (SHA-256 préalable pour égaliser les longueurs,
  // comme verifyVerifier) : évite une fuite de timing sur le jeton d'invitation.
  const a = crypto.createHash('sha256').update(String(token)).digest();
  const b = crypto.createHash('sha256').update(String(invite)).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Vérifie la preuve d'accès (`verifier`) d'un salon chiffré, à TEMPS CONSTANT
 * (SHA-256 préalable pour égaliser les longueurs, comme admin.tokensMatch).
 * Ne s'applique qu'aux salons chiffrés ; le serveur ne voit jamais le mot de passe.
 */
async function verifyVerifier(id, verifier) {
  const [enc, expected] = await client.hmGet(roomKey(id), ['encrypted', 'verifier']);
  if (enc !== '1' || !expected) return false;
  const a = crypto.createHash('sha256').update(String(verifier == null ? '' : verifier)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

async function deleteRoom(id) {
  await client.del(roomKey(id));
  await client.del(membersKey(id));
  await client.sRem(PUBLIC_INDEX, id);
}

/** Salons publics pour le navigateur de salons (nom + nombre de membres). */
async function listPublic() {
  const ids = await client.sMembers(PUBLIC_INDEX);
  const out = [];
  for (const id of ids) {
    const room = await getRoom(id);
    if (!room) {
      await client.sRem(PUBLIC_INDEX, id);
      continue;
    }
    // Salons de région : hors annuaire public. Chacun ne voit et
    // ne rejoint QUE le salon de sa propre région (reçu via l'ack d'identify) ; les
    // salons des autres régions restent totalement invisibles.
    if (isRegionRoomId(id)) continue;
    const count = await memberCount(id);
    if (count === 0 && !isPersistentRoom(room)) {
      // RG-05 : un salon vide ne doit pas subsister — sauf un salon permanent.
      await deleteRoom(id);
      continue;
    }
    out.push({
      id,
      name: room.name,
      type: room.type,
      count,
      persistent: isPersistentRoom(room),
      // Un salon chiffré est listé avec son cadenas + son sel public (dérivation directe) ; jamais le verifier.
      encrypted: room.encrypted,
      salt: room.encrypted ? room.salt : undefined,
    });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}

module.exports = {
  createRoom,
  createPersistentRoom,
  isPersistentRoom,
  regionRoomId,
  isRegionRoomId,
  ensureRegionRoom,
  setName,
  getRoom,
  addMember,
  removeMember,
  isMember,
  memberIds,
  memberCount,
  memberProfiles,
  ownerOf,
  setOwner,
  setPassword,
  verifyPassword,
  verifyInvite,
  verifyVerifier,
  deleteRoom,
  listPublic,
  toPublic,
};
