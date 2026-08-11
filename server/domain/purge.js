'use strict';

const geo = require('./geo');
const invites = require('./invites');
const rooms = require('./rooms');
const sessions = require('./sessions');

/**
 * Remise à zéro de l'état de CONVERSATION, pour la console opérateur.
 *
 * Ce module ne connaît la forme d'aucune clé Redis : chaque domaine efface les
 * siennes, il ne fait que composer et dénombrer. C'est la frontière habituelle — une
 * clé n'est connue que du module qui l'écrit — et elle vaut plus ici qu'ailleurs :
 * un effaceur qui tiendrait sa propre liste de préfixes oublierait le premier ajouté
 * après lui, en silence.
 *
 * CE QU'IL N'EFFACE JAMAIS, et c'est le fond de l'affaire :
 *  - `mod:*` (signalements, exclusions volatiles, incidents) — un signalement reçu est
 *    une notification au sens de l'art. 16 : l'emporter dans une remise à zéro
 *    d'exploitation supprimerait la trace d'une notification à traiter. Un signalement
 *    ne se purge qu'à l'unité, par l'opérateur qui le résout, ou par son TTL.
 *  - le gel du sel IP et l'incident qui le porte — une préservation prospective ne peut
 *    pas dépendre d'un geste d'exploitation. `admin.js` refuse d'ailleurs la remise à
 *    zéro tant que le sel est gelé.
 *  - `rl:*` et `metrics:onion:*` — anti-spam et compteurs de dimensionnement. Remettre
 *    les seaux à zéro ouvrirait une fenêtre de flood juste après le geste ; remettre
 *    les compteurs à zéro fausserait ce qui sert à régler la plateforme.
 *  - `stats:*` (audience et usage, cf. `domain/analytics.js`) — ce ne sont pas des
 *    conversations mais l'historique du site, et la remise à zéro sert à repartir
 *    d'une plateforme vide, pas à effacer le mois écoulé. Ils expirent seuls
 *    (`analytics.retentionDays`), ce qui suffit à ce que rien ne s'accumule.
 *
 * La portée est celle de Redis : GLOBALE, donc toutes les instances à la fois.
 */

/**
 * Efface sessions, présence, salons et invitations. Renvoie le décompte de chaque
 * catégorie — c'est ce que l'opérateur lit pour savoir que le geste a porté.
 *
 * La présence d'abord, à dessein : elle est le seul index qui fasse se rencontrer deux
 * sessions. La vider en premier, c'est garantir qu'aucun voisinage ne se calcule plus
 * sur des sessions à demi effacées pendant le reste du balayage.
 */
async function purgeChatState() {
  const presence = await geo.clearPresence();
  const sessionCount = await sessions.purgeAll();
  const roomCount = await rooms.purgeAll();
  const inviteCount = await invites.purgeAll();
  return { presence, sessions: sessionCount, rooms: roomCount, invites: inviteCount };
}

module.exports = { purgeChatState };
