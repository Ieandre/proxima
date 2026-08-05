'use strict';

const crypto = require('crypto');
const { client } = require('../infra/redis');
const { scanKeys } = require('../infra/scan');
const { genId, isValidId } = require('../protocol');
const sessions = require('./sessions');
const config = require('../config');

/**
 * Salons publics/privés (§2.4). État volatil en Redis :
 *  - hash  `room:<id>`         : métadonnées (nom, type, propriétaire, mot de passe haché, jeton d'invitation) ;
 *  - zset  `room:<id>:members` : membres, score = ordre d'arrivée (pour le transfert de propriété RG-06) ;
 *  - set   `rooms:pub`         : index des salons publics (pour le listing).
 *
 * AUCUN SALON NE CIRCULE EN CLAIR. Deux régimes de clé, portés par `keyMode`, qui
 * dit comment la clé s'OBTIENT — la porte d'entrée, elle, est une question séparée :
 *
 *  - `'password'` : clé dérivée par Argon2id du mot de passe + sel public, côté
 *    client. Le serveur détient un `verifier` (preuve d'accès) et plafonne les membres.
 *  - `'group'`    : clé symétrique aléatoire détenue par les seuls membres, transmise
 *    d'un membre à l'autre enveloppée en `crypto_box` (cf. `room-actions.js` et les
 *    événements `room:key:*`). Le serveur ne la voit jamais et ne plafonne pas.
 *
 * La PORTE et la CLÉ sont deux choses distinctes, et c'est ce qui rend les trois
 * types de salon exprimables avec deux régimes :
 *
 *  | Type                        | Porte                            | Régime de clé |
 *  |-----------------------------|----------------------------------|---------------|
 *  | public                      | aucune                           | `group`       |
 *  | privé sur invitation        | jeton d'invitation ou mot de passe de salon (haché SHA-256, côté serveur) | `group` |
 *  | privé chiffré à mot de passe | `verifier` (preuve E2E)         | `password`    |
 *
 * Le mot de passe d'un salon privé sur invitation reste donc ce qu'il a toujours été —
 * une porte vérifiée par le serveur — sans devenir pour autant la clé du contenu.
 *
 * Ce que le régime `'group'` protège, et ce qu'il ne protège pas : quiconque franchit
 * la porte obtient la clé. La confidentialité vaut face à l'hébergeur — qui ne peut
 * plus lire ce qu'il relaie — et jamais face aux participants. C'est un choix assumé,
 * pas une limite qu'on comblera.
 *
 * ÉPOQUE DE CLÉ (`keyEpoch`) — un simple compteur, pas du matériel cryptographique.
 * Une clé de groupe ne survit qu'à travers ses porteurs : quand le dernier membre
 * s'en va, elle est perdue (un salon permanent, lui, reste). Le prochain arrivant
 * en engendre donc une neuve, et l'époque s'incrémente pour que les deux
 * générations ne soient jamais confondues. La règle de convergence est « la plus
 * haute époque fait foi » : un membre qui reçoit un message d'une époque
 * supérieure à la sienne réclame la clé correspondante. C'est ce qui rend deux
 * genèses simultanées inoffensives — `hIncrBy` étant atomique, elles obtiennent
 * deux époques distinctes, et la plus basse rattrape la plus haute au premier
 * message.
 */
const ROOM_PREFIX = 'room:';
const roomKey = (id) => `${ROOM_PREFIX}${id}`;
const membersKey = (id) => `${ROOM_PREFIX}${id}:members`;
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
    // Comment la clé s'obtient — le client en a besoin pour savoir s'il doit demander
    // un mot de passe ou réclamer la clé aux membres.
    keyMode: room.keyMode,
    keyEpoch: room.keyEpoch,
    // Sel Argon2id public, exposé pour le SEUL régime mot de passe (il sert à y dériver la
    // clé). Ne jamais l'exposer autrement : sur un privé en clair, `salt` est le sel
    // interne du hachage de `pass`.
    salt: room.keyMode === 'password' ? room.salt : undefined,
  };
}

function hashPassword(salt, password) {
  return crypto.createHash('sha256').update(salt).update(password).digest('base64url');
}

async function createRoom({ name, type, password, ownerId, encrypted, verifier, salt }) {
  const id = genId(8);
  const invite = genId(16);
  const isEncrypted = !!encrypted;
  const isPrivate = type === 'private' || isEncrypted; // un salon à mot de passe est toujours privé
  // Régime de clé : dérivé du mot de passe si demandé, sinon clé de groupe. Il n'existe
  // aucun troisième cas — plus aucun salon ne circule en clair.
  const keyMode = isEncrypted ? 'password' : 'group';
  // Salon à mot de passe : le sel Argon2id (16 o) est fourni PAR LE CLIENT et public ; sinon sel SHA-256 interne.
  const roomSalt = isEncrypted ? salt : genId(8);
  await client.hSet(roomKey(id), {
    name,
    type: isPrivate ? 'private' : 'public',
    owner: ownerId,
    invite,
    salt: roomSalt,
    // `pass` (hash SHA-256) = la PORTE d'un privé sur invitation, distincte de la clé du
    // contenu ; `verifier` (preuve E2E) n'existe qu'en régime mot de passe.
    pass: keyMode === 'group' && isPrivate && password ? hashPassword(roomSalt, password) : '',
    verifier: isEncrypted ? verifier : '',
    keyMode,
    encrypted: '1',
    // Le créateur est le premier membre : en régime de groupe, c'est lui qui engendre
    // la clé, l'époque part donc à 1 sans passer par la coordination du join.
    keyEpoch: keyMode === 'group' ? '1' : '',
    createdAt: String(nextScore()),
  });
  await client.expire(roomKey(id), config.ttl.roomSec);
  await addMember(id, ownerId);
  // Visibilité : les publics et les salons à mot de passe sont listés (nom + cadenas) ;
  // un privé sur invitation reste hors index — c'est son invitation qui le fait connaître.
  if (!isPrivate || keyMode === 'password') await client.sAdd(PUBLIC_INDEX, id);
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
    // Public, donc chiffré en régime de groupe comme les autres. Aucune époque n'est
    // posée ici : un permanent naît VIDE (aucun membre à qui confier une clé), c'est
    // son premier arrivant qui l'engendre.
    keyMode: 'group',
    encrypted: '1',
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
  // Identifiant hors charte (un `:`, typiquement) : refus AVANT de toucher Redis,
  // sans quoi un `hGetAll` viserait la clé zset `room:<id>:members` (WRONGTYPE →
  // rejet non géré → arrêt du processus). Cf. `protocol.isValidId`.
  if (!isValidId(id)) return null;
  const h = await client.hGetAll(roomKey(id));
  if (!h || !h.name) return null;
  /**
   * Régime de clé DÉDUIT quand le champ est absent — c'est ce qui rattrape les salons
   * nés avant l'extension du chiffrement à tous les salons. La déduction n'est pas un
   * confort : un salon PERMANENT n'a pas de TTL, il ne s'efface donc jamais tout seul
   * et resterait en clair à vie sans elle. Un salon d'alors qui portait `encrypted`
   * était nécessairement à mot de passe ; tout autre passe en régime de groupe.
   */
  const keyMode = h.keyMode ? h.keyMode : h.encrypted === '1' ? 'password' : 'group';
  return {
    id,
    name: h.name,
    type: h.type,
    owner: h.owner,
    invite: h.invite,
    hasPassword: !!h.pass,
    keyMode,
    // Régime de clé mot de passe : sel Argon2id public exposé ; `verifier` JAMAIS exposé.
    // `encrypted` est désormais TOUJOURS vrai — les deux régimes chiffrent. Conservé
    // parce que l'interface l'affiche, et parce qu'un jour un régime en clair pourrait
    // revenir : la question « ce salon est-il lisible par le serveur ? » garde un nom.
    encrypted: true,
    keyEpoch: Number(h.keyEpoch || 0),
    salt: h.salt || '',
    persistent: h.persistent === '1',
    createdAt: Number(h.createdAt || 0),
  };
}

/**
 * Réclame la GENÈSE de la clé de groupe : ne réussit que si aucune époque n'existe.
 * `hSetNX` est atomique, donc parmi plusieurs arrivants simultanés dans un salon
 * neuf, un seul est désigné — les autres iront réclamer la clé aux membres.
 */
async function claimKeyGenesis(id) {
  return client.hSetNX(roomKey(id), 'keyEpoch', '1');
}

/**
 * Ouvre une NOUVELLE génération de clé et renvoie son numéro. Appelé quand plus
 * aucun membre ne peut servir la clé courante (tous partis) : la génération d'avant
 * est perdue et personne ne la réclamera plus. Atomique, donc deux appels
 * concurrents rendent deux numéros distincts — la plus haute époque l'emporte.
 */
async function bumpKeyEpoch(id) {
  return client.hIncrBy(roomKey(id), 'keyEpoch', 1);
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
  if (!isValidId(id)) return false;
  const score = await client.zScore(membersKey(id), sessionId);
  return score !== null && score !== undefined;
}

/** Membres ordonnés par ancienneté (le plus ancien d'abord) — base du transfert RG-06. */
async function memberIds(id) {
  if (!isValidId(id)) return [];
  return client.zRange(membersKey(id), 0, -1);
}

async function memberCount(id) {
  if (!isValidId(id)) return 0;
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
  // Guard identique à `getRoom` : `room:kick`/`room:close` appellent `ownerOf` AVANT
  // tout contrôle de propriété, c'est donc un point d'entrée d'identifiant non fiable.
  if (!isValidId(id)) return null;
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
  if (!isValidId(id)) return false;
  const h = await client.hmGet(roomKey(id), ['salt', 'pass']);
  const [salt, pass] = h;
  if (!pass) return true; // pas de mot de passe défini
  return hashPassword(salt, password || '') === pass;
}

async function verifyInvite(id, token) {
  if (!isValidId(id)) return false;
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
  if (!isValidId(id)) return false;
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
      // Tout salon listé est chiffré ; c'est `keyMode` qui dit s'il faut un mot de passe
      // pour entrer (régime mot de passe) ou si l'entrée est libre (régime de groupe).
      // Le sel n'accompagne que le premier — jamais le verifier, dans aucun cas.
      encrypted: room.encrypted,
      keyMode: room.keyMode,
      salt: room.keyMode === 'password' ? room.salt : undefined,
    });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}

/**
 * TOUS les salons vivants, pour la console opérateur — y compris ceux que
 * `listPublic` tait : les salons de région (hors annuaire) et les privés sur
 * invitation, que l'index `rooms:pub` ne référence même pas. D'où le balayage des
 * clés plutôt qu'une lecture d'index : un salon qu'aucun index ne désigne est
 * justement celui qu'il faut pouvoir voir.
 *
 * Lecture SEULE, à la différence de `listPublic` : aucune purge RG-05 au passage.
 * Afficher un état ne doit pas le modifier — sans quoi l'opérateur qui regarde
 * deviendrait la cause de ce qu'il observe. Le ménage reste à `listPublic`, que les
 * métriques appellent au même rythme.
 *
 * Ce que la liste ne dit PAS, et c'est délibéré : qui est là. Elle donne un nombre ;
 * les pseudos et les identifiants de session ne s'obtiennent que salon par salon
 * (`admin:room:members`), sur le seul salon que l'opérateur ouvre.
 */
async function listAll() {
  const keys = await scanKeys(`${ROOM_PREFIX}*`);
  const out = [];
  for (const key of keys) {
    const id = key.slice(ROOM_PREFIX.length);
    // `room:<id>:members` partage le préfixe des métadonnées ; un identifiant de salon
    // (`genId` ou slug) ne contient jamais de deux-points.
    if (id.includes(':')) continue;
    const room = await getRoom(id);
    if (!room) continue;
    out.push({
      id,
      name: room.name,
      type: room.type,
      keyMode: room.keyMode,
      // La PORTE d'un privé sur invitation, distincte du régime de clé.
      hasPassword: room.hasPassword,
      persistent: isPersistentRoom(room),
      region: isRegionRoomId(id),
      count: await memberCount(id),
      createdAt: room.createdAt,
    });
  }
  out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'));
  return out;
}

/**
 * Efface TOUS les salons — métadonnées, membres et index public — et renvoie le
 * nombre de salons détruits. Les permanents partent avec les autres : ce sont des
 * clés `room:*` comme le reste, et leur relève appartient à l'appelant, qui rejoue
 * le seed (cf. `admin:reset`). Réservé à la remise à zéro opérateur.
 */
async function purgeAll() {
  const keys = await scanKeys(`${ROOM_PREFIX}*`);
  if (keys.length) await client.del(keys);
  await client.del(PUBLIC_INDEX);
  return keys.filter((k) => !k.slice(ROOM_PREFIX.length).includes(':')).length;
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
  claimKeyGenesis,
  bumpKeyEpoch,
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
  listAll,
  purgeAll,
  toPublic,
};
