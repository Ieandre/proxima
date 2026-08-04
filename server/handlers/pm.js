'use strict';

const { clamp, ack } = require('../protocol');
const sessions = require('../domain/sessions');
const rooms = require('../domain/rooms');

/**
 * MESSAGES PRIVÉS chiffrés de bout en bout (§2.3, §4.4, RG-07).
 * Le serveur relaie une enveloppe opaque : il ne peut pas lire le contenu.
 *
 * Corollaire non négociable : AUCUNE modération ici (RG-07). Le filtre de
 * mots-clés et la console opérateur n'agissent que sur les salons publics. Le
 * seul chemin de signalement d'un MP est `handlers/reports.js`, alimenté
 * volontairement par un participant qui détient le clair.
 */
function register({ io, socket, sid, limited }) {
  socket.on('pm:send', async (payload = {}) => {
    const id = sid();
    if (!id) return;
    if (await limited()) return socket.emit('error:rate');
    const toId = clamp(payload.toId, 32);
    const env = payload.env; // enveloppe chiffrée côté client (opaque pour le serveur)
    if (!toId || !env || typeof env !== 'object') return;
    const kind = payload.kind === 'media' ? 'media' : 'text';
    const data = payload.data; // octets chiffrés (pièce jointe) — opaques
    if (kind === 'media' && !data) return;
    const target = await sessions.getSession(toId);
    if (!target) return socket.emit('pm:undeliverable', { toId });
    const me = await sessions.getSession(id);
    io.to(`user:${toId}`).emit('pm:recv', {
      fromId: id,
      fromPseudo: me ? me.pseudo : '?',
      kind,
      env,
      data,
      ts: payload.ts || null,
    });
  });

  /**
   * MODIFICATION d'un MP. Le serveur ne sait même pas QUEL message est visé :
   * l'identifiant et le nouveau texte sont scellés dans l'enveloppe, comme pour
   * un envoi (cf. `frontend/src/lib/body.ts`). Il relaie donc à l'aveugle et
   * n'apprend rien qu'il ne savait déjà — que ces deux-là se parlent.
   *
   * Le destinataire vérifie de son côté que la modification vient bien de
   * l'auteur du message visé : `fromId` est attesté par la connexion, jamais par
   * le payload. Aucune modération ici non plus (RG-07).
   */
  socket.on('pm:edit', async (payload = {}) => {
    const id = sid();
    if (!id) return;
    if (await limited()) return socket.emit('error:rate');
    const toId = clamp(payload.toId, 32);
    const env = payload.env;
    if (!toId || !env || typeof env !== 'object') return;
    if (!(await sessions.getSession(toId))) return socket.emit('pm:undeliverable', { toId });
    io.to(`user:${toId}`).emit('pm:edited', { fromId: id, env });
  });

  // ----- Clé publique d'un·e présent·e, révélée à la demande -------------
  //
  //
  // Continuer en privé après s'être parlé dans un salon exige la clé publique du
  // destinataire — sans elle, `pm:send` n'a rien à chiffrer. Or la liste des
  // présents ne porte QUE `{ id, pseudo }` (`rooms.memberProfiles`) : c'est
  // délibéré, et on ne l'élargit pas. La clé se demande donc au coup par coup,
  // pour une seule personne, plutôt que d'être diffusée à tout le salon.
  //
  // La condition d'accès est le salon partagé, vérifié aux DEUX bouts : sans le
  // premier contrôle, n'importe qui obtiendrait la clé de n'importe qui en
  // devinant un `roomId`. Rien d'autre n'est divulgué — ni ville, ni âge, ni
  // genre : hors du rayon, la conversation s'ouvrira « hors de portée », ce qui
  // est exactement la vérité.
  socket.on('pm:key', async (payload = {}, cb) => {
    const id = sid();
    if (!id) return ack(cb, { error: 'Non identifié.' });
    if (await limited()) return ack(cb, { error: 'Trop de demandes. Patientez un instant.' });
    const roomId = clamp(payload.roomId, 32);
    const peerId = clamp(payload.peerId, 32);
    if (!roomId || !peerId) return ack(cb, { error: 'Demande incomplète.' });
    if (peerId === id) return ack(cb, { error: 'Vous ne pouvez pas vous écrire à vous-même.' });
    if (!(await rooms.isMember(roomId, id))) return ack(cb, { error: 'Salon inaccessible.' });
    if (!(await rooms.isMember(roomId, peerId))) return ack(cb, { error: 'Cette personne a quitté le salon.' });
    const peer = await sessions.getSession(peerId);
    if (!peer) return ack(cb, { error: "Cette personne n'est plus connectée." });
    ack(cb, { ok: true, peer: { id: peer.id, pseudo: peer.pseudo, pub: peer.pub } });
  });
}

module.exports = { register };
