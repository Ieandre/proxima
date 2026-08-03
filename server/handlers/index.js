'use strict';

const security = require('../security');
const geo = require('../domain/geo');
const sessions = require('../domain/sessions');
const rooms = require('../domain/rooms');
const roomActions = require('../room-actions');

const identity = require('./identity');
const presence = require('./presence');
const pm = require('./pm');
const pmInvites = require('./pm-invites');
const roomsHandlers = require('./rooms');
const messages = require('./messages');
const governance = require('./governance');
const reports = require('./reports');

/**
 * Câblage du namespace Socket.IO PUBLIC. Aucune règle métier ici : ce fichier
 * établit le contexte d'une connexion, puis délègue le branchement des
 * événements aux modules par famille.
 *
 * Chaque module expose `register(ctx)` et reçoit le même contexte (`sid`,
 * `limited`, actions de cycle de vie) — c'est ce qui permet de déplacer un
 * handler d'une famille à l'autre sans réécrire son corps.
 */

/**
 * Contexte d'une connexion, construit une fois par socket et passé tel quel aux
 * modules de handlers.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function buildContext(io, socket) {
  // IP utilisée uniquement pour l'anti-spam, jamais journalisée en clair (RG-08).
  // Extraction résistante au spoofing de X-Forwarded-For (cf. security.clientIp
  // / config.trustedProxies) : on ne fait confiance qu'au maillon ajouté par nos proxys.
  const ip = security.clientIp(socket.handshake);

  /**
   * Service onion Tor. Derrière l'onion, TOUS les visiteurs
   * arrivent avec l'IP du `tor` local : un seul compteur d'anti-spam pour tout le
   * trafic Tor, donc un bavard qui fait taire tout le monde. On bascule alors sur
   * deux seaux dédiés (par connexion + plafond global) — cf. `isOnionRateLimited`.
   */
  socket.data.onion = security.isOnionHandshake(socket.handshake);

  // Marqueur absent sur une connexion en loopback alors qu'un onion est annoncé :
  // le bloc Caddy ne s'applique probablement pas, et le seau collectif est de
  // retour sans que rien ne le signale. On rend l'échec bruyant (best-effort, ne
  // bloque pas la connexion).
  if (!socket.data.onion) {
    security.noteUnmarkedLoopback(ip).catch(() => {});
  }

  /**
   * Diffuse un signalement à la console opérateur (namespace /admin, Lot 4) et,
   * pour un salon, à son propriétaire — modérateur de première ligne (RG-06).
   * Émettre vers un namespace sans opérateur connecté est un no-op inoffensif.
   */
  const notifyReport = async (report) => {
    io.of('/admin').to('operators').emit('report:new', { report });
    if (report && report.scope === 'room' && report.roomId) {
      const owner = await rooms.ownerOf(report.roomId);
      if (owner) io.to(`user:${owner}`).emit('room:report:owner', { report });
    }
  };

  return {
    io,
    socket,
    /** Session courante, ou undefined avant `identify`. */
    sid: () => socket.data.sessionId,
    /** Anti-spam : seaux dédiés derrière l'onion, hash d'IP éphémère sinon. */
    limited: () => (socket.data.onion ? security.isOnionRateLimited(socket.id) : security.isRateLimited(ip)),
    // Actions de cycle de vie d'un salon, partagées avec la console opérateur
    // (RG-05 suppression si vide, RG-06 transfert de propriété). Voir room-actions.js.
    pushLobby: () => roomActions.pushLobby(io),
    broadcastMembers: (roomId) => roomActions.broadcastMembers(io, roomId),
    handleLeave: (roomId, leaverId) => roomActions.handleLeave(io, roomId, leaverId),
    notifyReport,
  };
}

/**
 * DÉCONNEXION (= fermeture navigateur/onglet) → destruction totale (RG-02).
 *
 * Reste ici plutôt que dans un module de famille : c'est la fin de vie de la
 * connexion elle-même, et elle touche à la fois les salons et le voisinage.
 */
function registerDisconnect({ io, socket, sid, handleLeave }) {
  socket.on('disconnect', async () => {
    const id = sid();
    if (!id) return;
    try {
      // Quitter tous les salons (transfert/suppression appliqués).
      for (const roomId of socket.data.rooms) {
        // Salon de région : départ automatique/silencieux, pas de message système.
        if (!rooms.isRegionRoomId(roomId)) {
          const me = await sessions.getPublicProfile(id);
          io.to(`room:${roomId}`).emit('room:system', {
            roomId,
            text: `${me ? me.pseudo : 'Quelqu\'un'} est sorti·e du salon.`,
          });
        }
        await handleLeave(roomId, id);
      }
      // Notifier les voisins du départ, puis détruire la session.
      const neighbours = await geo.nearbyIds(id);
      for (const nId of neighbours) io.to(`user:${nId}`).emit('presence:remove', { id });
      await sessions.deleteSession(id);
    } catch (err) {
      console.error('[disconnect]', err.message);
    }
  });
}

function registerHandlers(io) {
  io.on('connection', (socket) => {
    socket.data.rooms = new Set();

    const ctx = buildContext(io, socket);

    identity.register(ctx);
    presence.register(ctx);
    pm.register(ctx);
    pmInvites.register(ctx);
    roomsHandlers.register(ctx);
    messages.register(ctx);
    governance.register(ctx);
    reports.register(ctx);
    registerDisconnect(ctx);
  });
}

module.exports = { registerHandlers };
