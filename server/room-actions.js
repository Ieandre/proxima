'use strict';

const config = require('./config');
const rooms = require('./domain/rooms');
const sessions = require('./domain/sessions');

/**
 * Actions de cycle de vie d'un salon, partagées entre le namespace utilisateur
 * (`handlers/`) et la console opérateur (`admin.js`), pour que le
 * retrait/exclusion côté opérateur respecte EXACTEMENT les mêmes règles :
 * suppression d'un salon vide (RG-05) et transfert de propriété au plus ancien
 * participant présent (RG-06). Chaque fonction reçoit `io` en argument.
 *
 * `arrangeGroupKey` y est pour la même raison : entrer dans un salon public se fait
 * par DEUX chemins — `room:join` et l'auto-jonction au salon de région à l'`identify` —
 * et les deux doivent mettre l'arrivant en mesure d'obtenir la clé. Dupliquer cette
 * coordination, c'était laisser les salons de région illisibles à vie.
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

/**
 * Met un arrivant en mesure d'obtenir la clé d'un salon en régime de GROUPE, et renvoie
 * ce que l'ack doit lui dire. Un seul critère : existe-t-il un membre capable de la lui
 * servir ?
 *
 *  - PERSONNE (salon neuf, ou salon permanent que tous les porteurs ont quitté) :
 *    l'arrivant engendre la clé. `claimKeyGenesis` n'aboutit que si aucune époque
 *    n'existe ; sinon la génération précédente est définitivement perdue et l'on en
 *    ouvre une neuve. Une époque à 0 alors que des membres sont présents relève du même
 *    cas : ce sont les membres d'un salon qui était en clair, aucun ne détient de clé.
 *  - QUELQU'UN : on sollicite les membres les plus anciens (`keyResponders`), qui
 *    enverront la clé enveloppée pour lui. Plusieurs plutôt qu'un seul, pour ne pas
 *    dépendre d'un membre injoignable — l'arrivant retiendra la première réponse valide
 *    et ignorera les suivantes. Le surcoût est de deux petites enveloppes.
 *
 * Le serveur ne voit jamais la clé : il ne transporte que la clé PUBLIQUE de l'arrivant,
 * et plus tard une enveloppe opaque dans l'autre sens.
 */
async function arrangeGroupKey(io, room, joinerId) {
  if (!room || room.keyMode !== 'group') return {};
  const joiner = await sessions.getPublicProfile(joinerId);
  if (!joiner || !joiner.pub) return {};
  const holders = (await rooms.memberIds(room.id)).filter((m) => m !== joinerId);

  if (holders.length === 0 || room.keyEpoch === 0) {
    const fresh = await rooms.claimKeyGenesis(room.id);
    return { genesis: true, keyEpoch: fresh ? 1 : await rooms.bumpKeyEpoch(room.id) };
  }

  for (const holder of holders.slice(0, config.rooms.keyResponders)) {
    io.to(`user:${holder}`).emit('room:key:request', {
      roomId: room.id,
      epoch: room.keyEpoch,
      toId: joinerId,
      toPub: joiner.pub,
    });
  }
  return { keyEpoch: room.keyEpoch };
}

module.exports = { pushLobby, broadcastMembers, handleLeave, arrangeGroupKey };
