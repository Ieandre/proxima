'use strict';

const { clamp, ack } = require('../protocol');
const rooms = require('../domain/rooms');

/**
 * GOUVERNANCE D'UN SALON — réservée au propriétaire (RG-06).
 *
 * Le propriétaire est le modérateur de première ligne de son salon : il exclut,
 * ferme, change le mot de passe. Les trois handlers commencent donc par la MÊME
 * vérification, et c'est la seule chose qu'ils ont en commun — d'où leur
 * regroupement ici, à l'écart du cycle de vie (`rooms.js`) et des messages.
 *
 * La console opérateur dispose de ses propres miroirs (`admin:kick`,
 * `admin:close`) dans `admin.js`, qui passent par les mêmes actions partagées
 * (`room-actions.js`) pour ne jamais diverger de ces règles.
 */
function register({ io, socket, sid, pushLobby, broadcastMembers }) {
  socket.on('room:kick', async (payload = {}, cb) => {
    const id = sid();
    const roomId = clamp(payload.roomId, 32);
    const targetId = clamp(payload.targetId, 32);
    if (!id) return ack(cb, { error: 'Non identifié.' });
    if ((await rooms.ownerOf(roomId)) !== id) return ack(cb, { error: 'Action réservée au propriétaire.' });
    if (targetId === id) return ack(cb, { error: 'Vous ne pouvez pas vous exclure.' });
    if (!(await rooms.isMember(roomId, targetId))) return ack(cb, { error: 'Membre introuvable.' });

    await rooms.removeMember(roomId, targetId);
    io.to(`user:${targetId}`).emit('room:kicked', { roomId });
    io.in(`user:${targetId}`).socketsLeave(`room:${roomId}`);
    ack(cb, { ok: true });
    await broadcastMembers(roomId);
    await pushLobby();
  });

  socket.on('room:close', async (payload = {}, cb) => {
    const id = sid();
    const roomId = clamp(payload.roomId, 32);
    if (!id) return ack(cb, { error: 'Non identifié.' });
    if ((await rooms.ownerOf(roomId)) !== id) return ack(cb, { error: 'Action réservée au propriétaire.' });
    io.to(`room:${roomId}`).emit('room:closed', { roomId });
    io.in(`room:${roomId}`).socketsLeave(`room:${roomId}`);
    await rooms.deleteRoom(roomId);
    ack(cb, { ok: true });
    await pushLobby();
  });

  socket.on('room:password', async (payload = {}, cb) => {
    const id = sid();
    const roomId = clamp(payload.roomId, 32);
    const password = clamp(payload.password, 64);
    if (!id) return ack(cb, { error: 'Non identifié.' });
    const room = await rooms.getRoom(roomId);
    if (!room) return ack(cb, { error: 'Salon introuvable.' });
    if (room.owner !== id) return ack(cb, { error: 'Action réservée au propriétaire.' });
    if (room.encrypted) return ack(cb, { error: 'Salon chiffré : mot de passe figé à la création.' });
    if (room.type !== 'private') return ack(cb, { error: 'Salon public : pas de mot de passe.' });
    await rooms.setPassword(roomId, password);
    ack(cb, { ok: true });
    io.to(`room:${roomId}`).emit('room:system', { roomId, text: 'Le mot de passe du salon a été modifié.' });
  });
}

module.exports = { register };
