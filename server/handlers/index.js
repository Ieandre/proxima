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
 *
 * Les actions du contexte qui ne dépendent QUE de `io` sont déléguées à
 * `room-actions.js`, partagé avec la console opérateur. `announceLeave` reste ici :
 * sa condition est un état de la connexion (`socket.data.spoke`), qu'un module sans
 * socket — `admin.js` — n'a par construction pas à connaître.
 */

/**
 * Contexte d'une connexion, construit une fois par socket et passé tel quel aux
 * modules de handlers.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function buildContext(io, socket) {
  /** Session courante, ou undefined avant `identify`. */
  const sid = () => socket.data.sessionId;

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

  /**
   * Annonce un départ aux présents — et SEULEMENT le départ de qui a pris la
   * parole dans ce salon (`socket.data.spoke`, renseigné à la diffusion par
   * `handlers/messages.js`).
   *
   * L'entrée, elle, n'est jamais annoncée : la présence se lit dans la liste des
   * présents, là où elle a sa place, plutôt qu'en interrompant la conversation.
   * L'annonce de sortie seule créerait alors une asymétrie qui dit trop — « X est
   * sorti·e » désignerait rétroactivement quelqu'un dont personne n'avait vu
   * l'arrivée. La restreindre à qui a parlé lève les deux : silence pour qui n'a
   * fait que passer, courtoisie envers ceux à qui l'on répondait.
   *
   * L'appartenance à `spoke` est acquise pour la session : sortir puis revenir
   * ne rend pas muet quelqu'un que le salon a déjà entendu.
   *
   * Le salon de région reste muet dans tous les cas — on y est rattaché d'office.
   */
  const announceLeave = async (roomId) => {
    if (rooms.isRegionRoomId(roomId) || !socket.data.spoke.has(roomId)) return;
    const me = await sessions.getPublicProfile(sid());
    io.to(`room:${roomId}`).emit('room:system', {
      roomId,
      text: `${me ? me.pseudo : 'Quelqu\'un'} est sorti·e du salon.`,
    });
  };

  return {
    io,
    socket,
    sid,
    /** Anti-spam : seaux dédiés derrière l'onion, hash d'IP éphémère sinon. */
    limited: () => (socket.data.onion ? security.isOnionRateLimited(socket.id) : security.isRateLimited(ip)),
    // Actions de cycle de vie d'un salon, partagées avec la console opérateur
    // (RG-05 suppression si vide, RG-06 transfert de propriété). Voir room-actions.js.
    pushLobby: () => roomActions.pushLobby(io),
    broadcastMembers: (roomId) => roomActions.broadcastMembers(io, roomId),
    handleLeave: (roomId, leaverId) => roomActions.handleLeave(io, roomId, leaverId),
    // Remise de la clé d'un salon public à un arrivant. Dans le contexte parce que
    // DEUX chemins y entrent : `room:join` et l'auto-jonction au salon de région.
    arrangeGroupKey: (room, joinerId) => roomActions.arrangeGroupKey(io, room, joinerId),
    announceLeave,
    notifyReport,
  };
}

/**
 * DÉCONNEXION (= fermeture navigateur/onglet) → destruction totale (RG-02).
 *
 * Reste ici plutôt que dans un module de famille : c'est la fin de vie de la
 * connexion elle-même, et elle touche à la fois les salons et le voisinage.
 */
function registerDisconnect({ io, socket, sid, handleLeave, announceLeave }) {
  socket.on('disconnect', async () => {
    const id = sid();
    if (!id) return;
    try {
      // Quitter tous les salons (transfert/suppression appliqués). Fermer l'onglet
      // est un départ comme un autre : il s'annonce sous la même condition.
      for (const roomId of socket.data.rooms) {
        await announceLeave(roomId);
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
    // Salons où l'on a pris la parole — la condition d'annonce d'un départ (cf.
    // `announceLeave`). Porté par la connexion : rien en Redis, rien qui survive
    // à l'onglet (RG-01/02).
    socket.data.spoke = new Set();

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
