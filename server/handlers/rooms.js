'use strict';

const config = require('../config');
const { clamp, ack } = require('../protocol');
const rooms = require('../domain/rooms');
const moderation = require('../domain/moderation');

/**
 * SALONS (§2.4) — cycle de vie : création, listing, pré-vol, entrée, sortie, et
 * remise de la clé de groupe aux arrivants.
 *
 * Les messages sont dans `messages.js` et la gouvernance (exclusion, fermeture,
 * mot de passe) dans `governance.js` : ce qui suit ne concerne que l'appartenance.
 *
 * Entrer reste muet (l'annonce d'un départ est portée par `announceLeave`, partagée
 * avec la fermeture d'onglet), mais `io` est requis : la clé d'un salon public
 * circule de membre à membre, et c'est ce module qui met les deux en relation.
 */
function register({ io, socket, sid, limited, pushLobby, broadcastMembers, handleLeave, announceLeave, arrangeGroupKey }) {
  socket.on('room:create', async (payload = {}, cb) => {
    const id = sid();
    if (!id) return ack(cb, { error: 'Non identifié.' });
    const name = clamp(payload.name, 32).trim();
    // Chiffrement à MOT DE PASSE : toujours privé, mot de passe exclusif (pas d'invitation).
    // Un salon public est chiffré aussi, mais en régime de GROUPE — le client ne le
    // demande pas, c'est le domaine qui l'attribue (cf. `rooms.createRoom`).
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
    // Un salon à mot de passe n'expose pas d'invitation (mot de passe exclusif).
    // En régime de groupe, le créateur est seul membre : c'est lui qui engendre la clé
    // (l'époque est déjà à 1, cf. `rooms.createRoom`).
    ack(cb, {
      ok: true,
      room: rooms.toPublic(room),
      invite: encrypted ? undefined : invite,
      owner: id,
      members,
      genesis: room.keyMode === 'group',
    });
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
    ack(cb, {
      ok: true,
      name: room.name,
      encrypted: room.encrypted,
      // `keyMode` dit au client s'il doit réclamer un mot de passe avant d'entrer
      // (régime mot de passe) ou entrer directement (régime de groupe).
      keyMode: room.keyMode,
      salt: room.keyMode === 'password' ? room.salt : '',
    });
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

    if (room.keyMode === 'password') {
      // Régime mot de passe : accès par vérificateur (l'invitation est ignorée).
      // Plafond de membres (posture DSA) — sauf si déjà membre (reconnexion après reload).
      // Il ne s'applique QU'ICI : un salon public n'est pas plafonné, sa clé de groupe
      // ne garde pas l'entrée.
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
    // Remise de la clé APRÈS l'inscription comme membre : les porteurs sollicités
    // répondent par `room:key:send`, qui vérifie l'appartenance des deux extrémités.
    const keyInfo = await arrangeGroupKey(room, id);
    ack(cb, { ok: true, room: rooms.toPublic(room), owner, members, ...keyInfo });

    // AUCUNE annonce d'arrivée, dans aucun salon. Entrer n'interrompt donc jamais
    // la conversation en cours, et regarder un salon avant d'y parler ne coûte rien
    // à personne — ce qui permet à l'entrée de n'être qu'un clic côté client.
    //
    // Rien n'est perdu pour autant : la composition diffusée juste après fait
    // apparaître l'arrivant dans la liste des présents, et le compte de la ligne
    // suit. La présence se lit là où elle a sa place. Un pseudo inconnu qui écrit
    // pour la première fois annonce son arrivée mieux qu'une ligne système.
    await broadcastMembers(roomId);
    await pushLobby();
  });

  /**
   * Un membre SERT la clé de groupe à un arrivant, en réponse à `room:key:request`.
   *
   * Le serveur relaie une enveloppe `crypto_box` scellée pour la clé publique de
   * l'arrivant : il ne peut ni la lire, ni vérifier qu'elle contient bien la clé du
   * salon — c'est le destinataire qui le constatera en déchiffrant, et qui écartera
   * une enveloppe illisible. Ce que le serveur vérifie, c'est l'APPARTENANCE des
   * deux extrémités : sans quoi il suffirait d'annoncer un identifiant pour se faire
   * remettre la clé d'un salon qu'on n'a pas rejoint.
   */
  socket.on('room:key:send', async (payload = {}) => {
    const id = sid();
    if (!id) return;
    if (await limited()) return;
    const roomId = clamp(payload.roomId, 32);
    const toId = clamp(payload.toId, 32);
    const env = payload.env;
    if (!roomId || !toId || !env || typeof env !== 'object') return;
    if (!(await rooms.isMember(roomId, id))) return;
    if (!(await rooms.isMember(roomId, toId))) return;
    // AUTORITÉ SERVEUR sur l'époque. Ne JAMAIS recopier `payload.epoch` : un membre
    // pourrait alors annoncer une génération fantaisiste (p. ex. 2^53) et, comme la
    // règle de convergence cliente est « la plus haute époque fait foi », rendre le
    // salon définitivement illisible pour ses destinataires (aucune remise ultérieure,
    // à l'époque réelle, ne rattraperait jamais celle-là). Le seul régime concerné est
    // `group` ; la remise d'un porteur légitime porte toujours l'époque courante du
    // salon, on la relit donc ici plutôt que de la croire.
    const room = await rooms.getRoom(roomId);
    if (!room || room.keyMode !== 'group') return;
    io.to(`user:${toId}`).emit('room:key:deliver', {
      roomId,
      epoch: room.keyEpoch,
      fromId: id,
      env,
    });
  });

  /**
   * Un membre RÉCLAME la clé : soit elle ne lui est jamais parvenue à l'entrée (aucun
   * porteur joignable sur le moment), soit il vient de voir passer un message d'une
   * époque plus récente que la sienne — la génération a changé pendant qu'il était là.
   * Même coordination qu'au join, donc même issue possible : se voir désigner pour
   * engendrer la clé si plus personne ne la détient.
   */
  socket.on('room:key:need', async (payload = {}, cb) => {
    const id = sid();
    if (!id) return ack(cb, { error: 'Non identifié.' });
    if (await limited()) return ack(cb, { error: 'Trop de requêtes. Patientez un instant.' });
    const roomId = clamp(payload.roomId, 32);
    if (!(await rooms.isMember(roomId, id))) return ack(cb, { error: 'Salon introuvable ou fermé.' });
    const room = await rooms.getRoom(roomId);
    if (!room || room.keyMode !== 'group') return ack(cb, { error: 'Salon introuvable ou fermé.' });
    ack(cb, { ok: true, ...(await arrangeGroupKey(room, id)) });
  });

  socket.on('room:leave', async (payload = {}) => {
    const id = sid();
    const roomId = clamp(payload.roomId, 32);
    if (!id || !socket.data.rooms.has(roomId)) return;
    socket.leave(`room:${roomId}`);
    socket.data.rooms.delete(roomId);
    // Annoncé APRÈS avoir quitté la diffusion : on ne se lit pas partir soi-même.
    // Qui n'a rien écrit ici sort comme il est entré, sans que rien ne le signale
    // (cf. `announceLeave`).
    await announceLeave(roomId);
    await handleLeave(roomId, id);
  });
}

module.exports = { register };
