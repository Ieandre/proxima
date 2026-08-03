'use strict';

const { clamp, ack } = require('../protocol');
const sessions = require('../domain/sessions');
const rooms = require('../domain/rooms');
const moderation = require('../domain/moderation');

/**
 * Signalements par un utilisateur (DSA art.16) — MP et salons.
 *
 * Le champ `source` dit à l'opérateur ce qu'il peut tenir pour établi :
 *  - `reporter-cleartext` (MP RG-07, salon chiffré) : le serveur n'a jamais vu le
 *    contenu, le clair vient du signalant. Ni le contenu ni l'auteur présumé ne
 *    sont vérifiables.
 *  - `reporter` (salon en clair) : le contenu a transité par le serveur.
 *
 * L'affaiblir reviendrait à présenter une affirmation d'utilisateur comme un
 * constat du service.
 *
 * Le motif n'est pas validé ici : `moderation.createReport` le normalise déjà
 * contre sa propre liste (`minor` prioritaire, DSA art.28).
 */
function register({ socket, sid, limited, notifyReport }) {
  socket.on('pm:report', async (payload = {}, cb) => {
    const id = sid();
    if (!id) return ack(cb, { error: 'Non identifié.' });
    if (await limited()) return ack(cb, { error: 'Trop de signalements. Patientez un instant.' });
    const peerId = clamp(payload.peerId, 32);
    const messageId = clamp(payload.messageId, 64);
    const content = clamp(payload.content, 2000).trim();
    if (!peerId || !content) return ack(cb, { error: 'Signalement incomplet.' });
    const me = await sessions.getSession(id);
    const author = await sessions.getSession(peerId);
    const report = await moderation.createReport({
      scope: 'pm',
      messageId,
      content,
      authorId: peerId,
      authorPseudo: author ? author.pseudo : '',
      reporterId: id,
      reporterPseudo: me ? me.pseudo : '?',
      reason: clamp(payload.reason, 20),
      source: 'reporter-cleartext',
    });
    if (report) await notifyReport(report);
    ack(cb, { ok: true });
  });

  socket.on('room:report', async (payload = {}, cb) => {
    const id = sid();
    if (!id) return ack(cb, { error: 'Non identifié.' });
    if (await limited()) return ack(cb, { error: 'Trop de signalements. Patientez un instant.' });
    const roomId = clamp(payload.roomId, 32);
    const messageId = clamp(payload.messageId, 32);
    const content = clamp(payload.content, 2000).trim();
    if (!roomId || !messageId || !content) return ack(cb, { error: 'Signalement incomplet.' });
    if (!(await rooms.isMember(roomId, id))) return ack(cb, { error: 'Salon inaccessible.' });
    const me = await sessions.getSession(id);
    // Pseudo de l'auteur figé à l'instant du signalement (snapshot, RG-02).
    const author = payload.authorId ? await sessions.getSession(clamp(payload.authorId, 32)) : null;
    const room = await rooms.getRoom(roomId);
    const report = await moderation.createReport({
      scope: 'room',
      roomId,
      messageId,
      content,
      authorId: clamp(payload.authorId, 32),
      authorPseudo: author ? author.pseudo : '',
      reporterId: id,
      reporterPseudo: me ? me.pseudo : '?',
      reason: clamp(payload.reason, 20),
      source: room && room.encrypted ? 'reporter-cleartext' : 'reporter',
    });
    if (report) await notifyReport(report);
    ack(cb, { ok: true }); // doublon (report === null) : on confirme quand même au signaleur
  });
}

module.exports = { register };
