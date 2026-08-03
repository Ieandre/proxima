'use strict';

const { clamp, ack } = require('../protocol');
const geo = require('../domain/geo');
const sessions = require('../domain/sessions');

/**
 * SIGNAUX DE PRÉSENCE ÉPHÉMÈRES — maintien en vie de la session, liste du
 * voisinage, et indicateur « est en train d'écrire ».
 *
 * Rien de ce qui passe ici ne porte de contenu : ce sont des signaux de présence,
 * dont la disparition est le comportement normal (RG-01).
 */
function register({ io, socket, sid }) {
  // Heartbeat : maintient la session en vie (TTL). Aucune action si expirée.
  socket.on('heartbeat', async () => {
    const id = sid();
    if (!id) return;
    const alive = await sessions.touch(id);
    if (alive) {
      const me = await sessions.getSession(id);
      if (me) await geo.addPresence(id, me.lon, me.lat); // ré-indexe si besoin
    }
  });

  // Rafraîchir la liste de présence à la demande.
  socket.on('presence:list', async (cb) => {
    const id = sid();
    if (!id) return ack(cb, { error: 'Non identifié.' });
    await sessions.touch(id);
    const profiles = await sessions.publicProfiles(await geo.nearbyIds(id));
    ack(cb, { ok: true, profiles });
    socket.emit('presence:list', profiles);
  });

  // ======================================================================
  // INDICATEUR « EST EN TRAIN D'ÉCRIRE » — signal éphémère, sans contenu.
  // ======================================================================
  socket.on('typing', (payload = {}) => {
    const id = sid();
    if (!id) return;
    const pseudo = socket.data.pseudo || '?';
    if (payload.scope === 'pm' && payload.toId) {
      io.to(`user:${clamp(payload.toId, 32)}`).emit('typing', { scope: 'pm', fromId: id, fromPseudo: pseudo });
    } else if (payload.scope === 'room') {
      const roomId = clamp(payload.roomId, 32);
      if (socket.data.rooms.has(roomId)) {
        // socket.to exclut l'émetteur.
        socket.to(`room:${roomId}`).emit('typing', { scope: 'room', roomId, fromId: id, fromPseudo: pseudo });
      }
    }
  });
}

module.exports = { register };
