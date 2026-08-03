'use strict';

const rooms = require('./domain/rooms');
const sessions = require('./domain/sessions');

/**
 * Actions de cycle de vie d'un salon, partagées entre le namespace utilisateur
 * (`handlers/`) et la console opérateur (`admin.js`), pour que le
 * retrait/exclusion côté opérateur respecte EXACTEMENT les mêmes règles :
 * suppression d'un salon vide (RG-05) et transfert de propriété au plus ancien
 * participant présent (RG-06). Chaque fonction reçoit `io` en argument.
 */

/** Rediffuse la liste des salons publics au lobby. */
async function pushLobby(io) {
  io.to('lobby').emit('rooms:list', await rooms.listPublic());
}

/** Notifie les membres d'un salon de sa composition à jour. */
async function broadcastMembers(io, roomId) {
  const members = await rooms.memberProfiles(roomId);
  const owner = await rooms.ownerOf(roomId);
  io.to(`room:${roomId}`).emit('room:members', { roomId, members, owner });
}

/**
 * Sortie d'un participant : retrait du membre, puis suppression si le salon
 * devient vide (RG-05), ou transfert de propriété au plus ancien présent (RG-06).
 */
async function handleLeave(io, roomId, leaverId) {
  await rooms.removeMember(roomId, leaverId);
  // RG-05/RG-06 exemptés pour un salon permanent : ni suppression si vide, ni transfert d'owner.
  const room = await rooms.getRoom(roomId);
  if (rooms.isPersistentRoom(room)) {
    await broadcastMembers(io, roomId);
    await pushLobby(io);
    return;
  }
  const remaining = await rooms.memberIds(roomId);
  if (remaining.length === 0) {
    await rooms.deleteRoom(roomId);
    await pushLobby(io);
    return;
  }
  const owner = await rooms.ownerOf(roomId);
  if (owner === leaverId) {
    const newOwner = remaining[0];
    await rooms.setOwner(roomId, newOwner);
    const profile = await sessions.getPublicProfile(newOwner);
    io.to(`room:${roomId}`).emit('room:system', {
      roomId,
      text: `${profile ? profile.pseudo : 'Un participant'} est désormais propriétaire du salon.`,
    });
  }
  await broadcastMembers(io, roomId);
  await pushLobby(io);
}

module.exports = { pushLobby, broadcastMembers, handleLeave };
