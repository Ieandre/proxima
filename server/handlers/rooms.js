'use strict';

const config = require('../config');
const { clamp, ack } = require('../protocol');
const sessions = require('../domain/sessions');
const rooms = require('../domain/rooms');
const moderation = require('../domain/moderation');

/**
 * SALONS (§2.4) — cycle de vie : création, listing, pré-vol, entrée, sortie.
 *
 * Les messages sont dans `messages.js` et la gouvernance (exclusion, fermeture,
 * mot de passe) dans `governance.js` : ce qui suit ne concerne que l'appartenance.
 */
function register({ io, socket, sid, limited, pushLobby, broadcastMembers, handleLeave }) {
  socket.on('room:create', async (payload = {}, cb) => {
    const id = sid();
    if (!id) return ack(cb, { error: 'Non identifié.' });
    const name = clamp(payload.name, 32).trim();
    // Salon chiffré E2E (RG-07 étendu) : toujours privé, mot de passe exclusif (pas d'invitation).
    const encrypted = payload.encrypted === '1' || payload.encrypted === true;
    const type = encrypted ? 'private' : payload.type === 'private' ? 'private' : 'public';
    const password = clamp(payload.password, 64);
    if (name.length < 2) return ack(cb, { error: 'Nom de salon trop court.' });

    let verifier = '';
    let salt = '';
    if (encrypted) {
      // Le serveur ne reçoit QUE la preuve d'accès + le sel public ; jamais le mot de passe ni la clé.
      verifier = clamp(payload.verifier, 64);
      salt = clamp(payload.salt, 32);
      if (!verifier || !salt) return ack(cb, { error: 'Paramètres de chiffrement manquants.' });
    }

    const { id: roomId, invite } = await rooms.createRoom({
      name,
      type,
      password,
      ownerId: id,
      encrypted,
      verifier,
      salt,
    });
    socket.join(`room:${roomId}`);
    socket.data.rooms.add(roomId);
    const room = await rooms.getRoom(roomId);
    const members = await rooms.memberProfiles(roomId);
    // Un salon chiffré n'expose pas d'invitation (mot de passe exclusif).
    ack(cb, { ok: true, room: rooms.toPublic(room), invite: encrypted ? undefined : invite, owner: id, members });
    await pushLobby();
  });

  socket.on('room:list', async (cb) => {
    ack(cb, { ok: true, rooms: await rooms.listPublic() });
  });

  // Pré-vol d'un salon AVANT le join : permet de récupérer le sel public d'un salon chiffré
  // pour dériver la clé côté client (chemin par lien `?r=`). Rate-limité ; ne révèle jamais
  // owner/membres/verifier — seulement nom + flag chiffré + sel public.
  socket.on('room:peek', async (payload = {}, cb) => {
    const id = sid();
    if (!id) return ack(cb, { error: 'Non identifié.' });
    if (await limited()) return ack(cb, { error: 'Trop de requêtes. Patientez un instant.' });
    const roomId = clamp(payload.roomId, 32);
    const room = await rooms.getRoom(roomId);
    if (!room) return ack(cb, { error: 'Salon introuvable ou fermé.' });
    ack(cb, { ok: true, name: room.name, encrypted: room.encrypted, salt: room.encrypted ? room.salt : '' });
  });

  socket.on('room:join', async (payload = {}, cb) => {
    const id = sid();
    if (!id) return ack(cb, { error: 'Non identifié.' });
    // Anti-bruteforce : limite les tentatives de mot de passe / vérificateur de salon.
    if (await limited()) return ack(cb, { error: 'Trop de requêtes. Patientez un instant.' });
    // Exclusion volatile best-effort (le check à l'identify serait inopérant : id neuf).
    if (await moderation.isBanned(id)) return ack(cb, { error: 'Accès restreint par la modération.' });
    const roomId = clamp(payload.roomId, 32);
    const room = await rooms.getRoom(roomId);
    if (!room) return ack(cb, { error: 'Salon introuvable ou fermé.' });

    if (room.encrypted) {
      // Salon chiffré : accès par vérificateur (mot de passe exclusif ; l'invitation est ignorée).
      // Plafond de membres (posture DSA) — sauf si déjà membre (reconnexion après reload).
      const already = await rooms.isMember(roomId, id);
      if (!already && (await rooms.memberCount(roomId)) >= config.rooms.encryptedMaxMembers) {
        return ack(cb, { error: 'Salon complet.' });
      }
      if (!(await rooms.verifyVerifier(roomId, clamp(payload.verifier, 64)))) {
        return ack(cb, { error: 'Mot de passe incorrect.' });
      }
    } else if (room.type === 'private') {
      const okInvite = payload.invite ? await rooms.verifyInvite(roomId, clamp(payload.invite, 64)) : false;
      const okPass = !okInvite ? await rooms.verifyPassword(roomId, clamp(payload.password, 64)) : true;
      if (!okInvite && !okPass) return ack(cb, { error: 'Mot de passe ou invitation invalide.' });
    }

    await rooms.addMember(roomId, id);
    socket.join(`room:${roomId}`);
    socket.data.rooms.add(roomId);
    const members = await rooms.memberProfiles(roomId);
    const owner = await rooms.ownerOf(roomId);
    ack(cb, { ok: true, room: rooms.toPublic(room), owner, members });

    const me = await sessions.getPublicProfile(id);
    // « entré·e » / « sorti·e » et non « a rejoint » / « a quitté » : on n'adhère à
    // rien ici, on est présent ou on ne l'est plus. Le client emploie les mêmes deux
    // verbes sur ses commandes, et la fiche d'entrée cite cette phrase mot pour mot
    // avant d'agir — l'annonce ne doit donc jamais diverger d'ici.
    io.to(`room:${roomId}`).emit('room:system', {
      roomId,
      text: `${me ? me.pseudo : 'Quelqu\'un'} est entré·e dans le salon.`,
    });
    await broadcastMembers(roomId);
    await pushLobby();
  });

  socket.on('room:leave', async (payload = {}) => {
    const id = sid();
    const roomId = clamp(payload.roomId, 32);
    if (!id || !socket.data.rooms.has(roomId)) return;
    socket.leave(`room:${roomId}`);
    socket.data.rooms.delete(roomId);
    // Salon de région : départ automatique/silencieux, pas de message système.
    if (!rooms.isRegionRoomId(roomId)) {
      const me = await sessions.getPublicProfile(id);
      io.to(`room:${roomId}`).emit('room:system', {
        roomId,
        text: `${me ? me.pseudo : 'Quelqu\'un'} est sorti·e du salon.`,
      });
    }
    await handleLeave(roomId, id);
  });
}

module.exports = { register };
