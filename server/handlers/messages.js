'use strict';

const { clamp, genId } = require('../protocol');
const sessions = require('../domain/sessions');
const rooms = require('../domain/rooms');
const moderation = require('../domain/moderation');

/**
 * MESSAGES DE SALON — le seul chemin par lequel du contenu de groupe transite.
 *
 * Deux régimes, et la distinction est structurelle :
 *  - salon CHIFFRÉ : le serveur relaie une enveloppe OPAQUE et NE SCANNE JAMAIS
 *    (RG-07 étendu, posture DSA art.8) ;
 *  - salon en CLAIR : diffusion, puis filtre de mots-clés NON bloquant qui ne
 *    peut créer qu'un signalement pour l'opérateur.
 *
 * Le flag `encrypted` du SALON fait foi, jamais le payload client : un client ne
 * peut pas se déclarer chiffré pour échapper au filtre, ni l'inverse.
 *
 * L'envoi (`room:message`) et la MODIFICATION (`room:edit`) suivent l'un et
 * l'autre ce partage — un texte retouché est du contenu de groupe comme un autre.
 */

/**
 * Champs d'une pièce jointe, identiques dans les deux régimes. Le `mime` est
 * tronqué et jamais interprété côté serveur ; les octets sont opaques dans les
 * deux cas (chiffrés en salon chiffré, simplement non inspectés sinon).
 */
function mediaFields(payload) {
  return {
    kind: 'media',
    mime: clamp(payload.mime, 100),
    media: payload.media === 'video' ? 'video' : 'image',
    data: payload.data,
  };
}

/**
 * Filtre de mots-clés d'un salon EN CLAIR — non bloquant : le texte a déjà été
 * diffusé, un match ne peut que créer un signalement pour l'opérateur.
 *
 * Appliqué à l'identique à un message et à sa MODIFICATION : sans cela, éditer
 * serait le contournement le plus simple du filtre (un texte anodin, puis son
 * remplacement). Le signalement porte le même `messageId` dans les deux cas —
 * c'est lui que vise le retrait ciblé.
 */
async function screen({ roomId, messageId, text, authorId, authorPseudo, notifyReport }) {
  const scan = moderation.scanText(text);
  if (!scan.flagged) return;
  const report = await moderation.createReport({
    scope: 'room',
    roomId,
    messageId,
    content: text,
    authorId,
    authorPseudo,
    reporterPseudo: 'filtre',
    reason: 'other',
    source: 'filter',
  });
  if (report) await notifyReport(report);
}

function register({ io, socket, sid, limited, notifyReport }) {
  socket.on('room:message', async (payload = {}) => {
    const id = sid();
    if (!id) return;
    if (await limited()) return socket.emit('error:rate');
    const roomId = clamp(payload.roomId, 32);
    if (!socket.data.rooms.has(roomId)) return;
    if (!(await rooms.isMember(roomId, id))) return;
    const room = await rooms.getRoom(roomId);
    if (!room) return;

    const isMedia = payload.kind === 'media';
    if (isMedia && !payload.data) return;

    const me = await sessions.getSession(id);
    // `id` de message généré SERVEUR (non forgeable par le client) : cible du retrait ciblé.
    const base = { id: genId(), roomId, fromId: id, fromPseudo: me ? me.pseudo : '?', ts: payload.ts || null };

    /**
     * Diffusion, et prise de parole actée dans le même geste : c'est elle qui rendra
     * le départ annonçable (cf. `announceLeave`). Marquée à la DIFFUSION et non à la
     * tentative — un message rejeté plus haut (non membre, vide, hors quota) n'a été
     * lu par personne, il ne doit donc pas donner droit à un « est sorti·e ».
     */
    const broadcast = (body) => {
      io.to(`room:${roomId}`).emit('room:message', body);
      socket.data.spoke.add(roomId);
    };

    if (room.encrypted) {
      const env = payload.env;
      if (!env || typeof env !== 'object') return;
      const body = isMedia ? { ...mediaFields(payload), env } : { kind: 'text', env };
      broadcast({ ...base, enc: '1', ...body });
      return;
    }

    // Réponse citée : le client n'envoie que l'IDENTIFIANT du message cité, jamais son
    // contenu — chaque destinataire résout la citation dans son propre fil (pas
    // d'historique reconstitué pour un arrivant, RG-01). Le serveur ne fait que le
    // relayer : rien à vérifier, aucun message n'étant conservé. Sur un salon chiffré
    // la référence est scellée dans l'enveloppe et n'est donc jamais lue ici.
    const replyTo = clamp(payload.replyTo, 32);
    const reply = replyTo ? { replyTo } : {};

    if (isMedia) {
      broadcast({ ...base, ...reply, ...mediaFields(payload) });
      return;
    }

    const text = clamp(payload.text, 2000).trim();
    if (!text) return;
    broadcast({ ...base, ...reply, kind: 'text', text });
    await screen({ roomId, messageId: base.id, text, authorId: id, authorPseudo: base.fromPseudo, notifyReport });
  });

  /**
   * MODIFICATION d'un message déjà diffusé — même partage des deux régimes que
   * `room:message` : opaque en salon chiffré, sous le filtre en salon clair.
   *
   * Le serveur ne conserve AUCUN message (RG-01) : il n'a donc rien à quoi
   * comparer `messageId` et ne peut pas vérifier que la personne en est l'auteur.
   * Ce qu'il atteste, il l'atteste comme pour un envoi : `fromId` vient de la
   * connexion, pas du payload. Ce sont les DESTINATAIRES qui refusent une
   * modification dont l'auteur revendiqué n'est pas celui du message visé — ils
   * sont les seuls à détenir le fil.
   *
   * Tenir côté serveur une table « message → auteur », même à TTL court,
   * n'apporterait aucune garantie de plus (un client modifié affiche de toute
   * façon ce qu'il veut sur son écran) et ajouterait exactement ce que le projet
   * refuse : une trace de qui a écrit quoi.
   *
   * Un retrait de modération ne peut pas être défait par une modification : la
   * bulle retirée est verrouillée côté client, là où l'information vit.
   */
  socket.on('room:edit', async (payload = {}) => {
    const id = sid();
    if (!id) return;
    if (await limited()) return socket.emit('error:rate');
    const roomId = clamp(payload.roomId, 32);
    if (!socket.data.rooms.has(roomId)) return;
    if (!(await rooms.isMember(roomId, id))) return;
    const room = await rooms.getRoom(roomId);
    if (!room) return;
    const messageId = clamp(payload.messageId, 32);
    if (!messageId) return;

    const base = { roomId, messageId, fromId: id };

    if (room.encrypted) {
      const env = payload.env;
      if (!env || typeof env !== 'object') return;
      io.to(`room:${roomId}`).emit('room:edited', { ...base, enc: '1', env });
      return;
    }

    // Un texte vide n'est pas une modification : le produit n'offre pas la
    // suppression d'un message (seule la modération retire), et une bulle vidée
    // en serait une par la porte de service.
    const text = clamp(payload.text, 2000).trim();
    if (!text) return;
    io.to(`room:${roomId}`).emit('room:edited', { ...base, text });

    const me = await sessions.getSession(id);
    await screen({
      roomId,
      messageId,
      text,
      authorId: id,
      authorPseudo: me ? me.pseudo : '?',
      notifyReport,
    });
  });
}

module.exports = { register };
