'use strict';

const crypto = require('crypto');
const { client } = require('../infra/redis');
const { scanKeys } = require('../infra/scan');
const config = require('../config');

/**
 * Invitations à une conversation privée par lien.
 *
 * Jeton opaque désignant une session vivante : aucun contenu, aucune PII
 * (`owner` est un identifiant de session, éphémère — RG-01/02).
 *
 * Un jeton plutôt que l'identifiant de session dans l'URL, parce qu'il est
 * révocable, porte son propre TTL, et évite de déposer l'adresse d'une session
 * dans l'historique du canal qui transporte le lien, où elle resterait lisible
 * après la fin de la conversation.
 *
 * Cycle : `create` → `peek` (n'engage rien) → `claim` → `destroy`. Une invitation
 * ne survit ni à l'acceptation ni au refus — sinon elle serait une adresse
 * durable, c'est-à-dire une identité persistante déguisée.
 */

const PREFIX = 'invite:';
const key = (token) => `${PREFIX}${token}`;
/** Index inverse : une seule invitation vivante par session (cf. `create`). */
const OWNER_PREFIX = `${PREFIX}by:`;
const ownerKey = (ownerId) => `${OWNER_PREFIX}${ownerId}`;

/** 128 bits : le jeton est un secret d'accès, il doit résister au devinage. */
const genToken = () => crypto.randomBytes(16).toString('base64url');

/**
 * Ouvre une invitation au nom d'une session. L'invitation précédente de la même
 * session est détruite : un seul lien vivant à la fois, ce qui borne le stockage
 * et correspond à ce que l'interface montre (un lien, pas une collection).
 */
async function create(ownerId) {
  const previous = await client.hGet(ownerKey(ownerId), 'token');
  if (previous) await client.del(key(previous));

  const token = genToken();
  const k = key(token);
  await client.hSet(k, { owner: ownerId, claimedBy: '' });
  await client.expire(k, config.ttl.inviteSec);

  const ok = ownerKey(ownerId);
  await client.hSet(ok, { token });
  await client.expire(ok, config.ttl.inviteSec);
  return token;
}

async function get(token) {
  if (!token) return null;
  const h = await client.hGetAll(key(token));
  if (!h || !h.owner) return null;
  return { token, owner: h.owner, claimedBy: h.claimedBy || '' };
}

/**
 * Réserve la place d'invité. Renvoie un motif d'échec plutôt qu'un booléen :
 * « expirée » et « déjà occupée » n'appellent pas la même réponse à l'écran —
 * la première invite à demander un nouveau lien, la seconde dit que c'est fini.
 *
 * La lecture puis l'écriture ne sont pas atomiques (le fake Redis du harnais de
 * test ne connaît pas `hSetNX`). Deux réclamations à la même milliseconde
 * feraient que l'auteur voit la dernière : cas limite bénin, sans conséquence de
 * sécurité — la place reste unique, c'est l'acceptation qui la donne.
 */
async function claim(token, guestId) {
  const invite = await get(token);
  if (!invite) return { ok: false, reason: 'gone' };
  if (invite.claimedBy && invite.claimedBy !== guestId) return { ok: false, reason: 'occupied' };
  await client.hSet(key(token), { claimedBy: guestId });
  return { ok: true, owner: invite.owner };
}

async function destroy(token) {
  const invite = await get(token);
  if (!invite) return;
  await client.del(key(token));
  await client.del(ownerKey(invite.owner));
}

/**
 * Efface toutes les invitations, index inverse compris, et renvoie le nombre de
 * LIENS détruits (pas de clés : l'index inverse n'est pas une invitation, il désigne
 * celle de son auteur). Réservé à la remise à zéro opérateur — cf. `domain/purge.js`.
 */
async function purgeAll() {
  const keys = await scanKeys(`${PREFIX}*`);
  if (keys.length) await client.del(keys);
  return keys.filter((k) => !k.startsWith(OWNER_PREFIX)).length;
}

module.exports = { create, get, claim, destroy, purgeAll };
