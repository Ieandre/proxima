'use strict';

const { clamp, ack } = require('../protocol');
const sessions = require('../domain/sessions');
const invites = require('../domain/invites');

/**
 * Invitation à une conversation privée par lien.
 *
 * Un lien de RENDEZ-VOUS : il ne vaut que tant que son auteur est connecté.
 * C'est la seule promesse tenable ici — une session vit 90 s sans heartbeat
 * (RG-01), et rien ne survit à la fermeture de l'onglet. Le lien ne crée donc
 * ni salon, ni boîte aux lettres : il désigne quelqu'un qui est là, maintenant.
 */
function register({ io, socket, sid, limited }) {
  socket.on('pm:invite:create', async (payload = {}, cb) => {
    const id = sid();
    if (!id) return ack(cb, { error: 'Non identifié.' });
    if (await limited()) return ack(cb, { error: 'Trop de demandes. Patientez un instant.' });
    ack(cb, { ok: true, token: await invites.create(id) });
  });

  // Pré-vol : renvoie le pseudo de l'auteur pour que l'invité sache à qui il
  // répond avant de créer la moindre identité.
  //
  // NE CONSOMME RIEN, et c'est structurel : les messageries qui transportent le
  // lien le déroulent pour en fabriquer un aperçu. Si l'ouverture consommait
  // l'invitation, le destinataire trouverait un lien déjà mort, tué par l'aperçu.
  // La place ne se réserve qu'à la réclamation explicite, sur socket.
  //
  // Appelé AVANT `identify`, donc sans session : le garde-fou est l'anti-spam par
  // IP, qui borne au passage l'énumération de jetons.
  socket.on('pm:invite:peek', async (payload = {}, cb) => {
    if (await limited()) return ack(cb, { error: 'Trop de demandes. Patientez un instant.' });
    const invite = await invites.get(clamp(payload.token, 64));
    if (!invite) return ack(cb, { error: 'Cette invitation a expiré.' });
    if (invite.claimedBy) return ack(cb, { error: 'Cette conversation est déjà occupée.' });
    const owner = await sessions.getSession(invite.owner);
    if (!owner) return ack(cb, { error: "L'auteur de cette invitation n'est plus connecté." });
    ack(cb, { ok: true, pseudo: owner.pseudo });
  });

  // Réclamation : l'invité se présente, l'auteur décide.
  //
  // L'accusé ne contient PAS l'identifiant de session de l'auteur : le connaître
  // suffirait à lui écrire directement (`pm:send` n'exige rien d'autre), ce qui
  // viderait l'accord de sa substance. L'invité ne reçoit ce profil qu'une fois
  // accepté, via `pm:invite:accepted`.
  socket.on('pm:invite:claim', async (payload = {}, cb) => {
    const id = sid();
    if (!id) return ack(cb, { error: 'Non identifié.' });
    if (await limited()) return ack(cb, { error: 'Trop de demandes. Patientez un instant.' });
    const token = clamp(payload.token, 64);
    const res = await invites.claim(token, id);
    if (!res.ok) {
      return ack(cb, {
        error: res.reason === 'occupied' ? 'Cette conversation est déjà occupée.' : 'Cette invitation a expiré.',
      });
    }
    const owner = await sessions.getSession(res.owner);
    if (!owner) {
      await invites.destroy(token);
      return ack(cb, { error: "L'auteur de cette invitation n'est plus connecté." });
    }
    const me = await sessions.getSession(id);
    io.to(`user:${res.owner}`).emit('pm:invite:pending', { token, guest: sessions.toPublic(me) });
    ack(cb, { ok: true, pseudo: owner.pseudo });
  });

  // Acceptation : les deux profils publics sont échangés d'un coup — c'est ce
  // qui donne à chacun la clé publique de l'autre (§4.4) et ouvre le fil.
  // L'invitation est détruite dans la foulée : elle valait pour une conversation,
  // pas comme adresse durable, qui serait une identité persistante déguisée.
  socket.on('pm:invite:accept', async (payload = {}, cb) => {
    const id = sid();
    if (!id) return ack(cb, { error: 'Non identifié.' });
    const token = clamp(payload.token, 64);
    const invite = await invites.get(token);
    // `gone` distingue « ce lien n'existe plus » de « réessayez » : sans lui, la
    // fiche resterait à proposer une ouverture désormais impossible.
    if (!invite || invite.owner !== id) return ack(cb, { error: 'Cette invitation a expiré.', gone: true });
    if (!invite.claimedBy) return ack(cb, { error: "Personne n'attend." });
    const guest = await sessions.getSession(invite.claimedBy);
    if (!guest) {
      await invites.destroy(token);
      return ack(cb, { error: "Votre correspondant·e n'est plus connecté·e.", gone: true });
    }
    const me = await sessions.getSession(id);
    await invites.destroy(token);
    io.to(`user:${invite.claimedBy}`).emit('pm:invite:accepted', { peer: sessions.toPublic(me) });
    ack(cb, { ok: true, peer: sessions.toPublic(guest) });
  });

  // Révocation : sert au refus d'un entrant comme au retrait du lien. Un seul
  // geste dans les deux cas — l'invitation disparaît — donc un seul handler.
  socket.on('pm:invite:revoke', async (payload = {}, cb) => {
    const id = sid();
    if (!id) return ack(cb, { error: 'Non identifié.' });
    const invite = await invites.get(clamp(payload.token, 64));
    // Silencieux si l'invitation n'est plus là ou n'est pas la sienne : le but
    // est qu'elle n'existe plus, et c'est déjà le cas.
    if (!invite || invite.owner !== id) return ack(cb, { ok: true });
    if (invite.claimedBy) io.to(`user:${invite.claimedBy}`).emit('pm:invite:declined');
    await invites.destroy(invite.token);
    ack(cb, { ok: true });
  });
}

module.exports = { register };
