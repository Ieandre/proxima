'use strict';

const { clamp, genId } = require('../protocol');
const sessions = require('../domain/sessions');
const rooms = require('../domain/rooms');

/**
 * MESSAGES DE SALON — le seul chemin par lequel du contenu de groupe transite.
 *
 * Il n'y a plus qu'un régime : le serveur relaie une enveloppe OPAQUE et NE SCANNE
 * JAMAIS (RG-07, posture DSA art.8). Tout salon est chiffré — les deux régimes de clé
 * (`password`, `group`, cf. `domain/rooms.js`) diffèrent par la façon d'obtenir la clé,
 * jamais par ce qui traverse le fil. Un message sans enveloppe est donc simplement
 * ignoré : il n'existe aucun chemin par lequel du clair pourrait passer, et c'est
 * volontaire — un tel chemin serait la seule façon de faire lire au serveur ce qu'il
 * n'est pas censé voir.
 *
 * Ce que le serveur ne peut donc PAS faire, et qu'il faut assumer plutôt que
 * contourner : aucune détection automatique de contenu. La modération repose
 * intégralement sur le signalement (art.16), où le clair est fourni par le signaleur
 * et marqué non vérifié.
 *
 * L'envoi (`room:message`) et la MODIFICATION (`room:edit`) suivent la même règle —
 * un texte retouché est du contenu de groupe comme un autre.
 */

/**
 * Époque de la clé qui scelle cette enveloppe. Relayée telle quelle depuis l'émetteur
 * — et non lue sur le salon : un membre peut légitimement être resté sur une
 * génération antérieure, et c'est l'ENVELOPPE que l'époque décrit, pas le salon. Le
 * serveur n'a de toute façon rien à vérifier là, ne détenant aucune clé ; au pire une
 * valeur fantaisiste rend le message illisible pour ses destinataires, qui
 * réclameront une clé inexistante et n'obtiendront rien. Vaut 0 en régime mot de passe
 * (une clé dérivée d'un mot de passe n'a pas de génération).
 */
function keyEpoch(payload) {
  const n = Number(payload.ke);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Natures de pièce jointe relayables. Liste fermée : le marqueur est réémis tel
 * quel à tout le salon, une valeur libre laisserait un émetteur y glisser du texte
 * de son choix.
 */
const MEDIA_KINDS = new Set(['image', 'video', 'audio']);

/**
 * Champs d'une pièce jointe. Le `mime` est tronqué et jamais interprété côté serveur ;
 * les octets sont chiffrés, donc opaques comme le reste.
 *
 * Le marqueur de nature reste en clair — le destinataire doit savoir quoi construire
 * avant de déchiffrer — et n'apprend au serveur rien que le `mime` ne dise déjà. Ce
 * qui DÉCRIT un vocal (sa silhouette sonore, sa durée) voyage, lui, dans le corps
 * scellé, hors de portée : la découpe parole/silence d'une voix en dirait trop sur
 * un contenu que le serveur n'est pas censé pouvoir lire.
 */
function mediaFields(payload) {
  return {
    kind: 'media',
    mime: clamp(payload.mime, 100),
    media: MEDIA_KINDS.has(payload.media) ? payload.media : 'image',
    data: payload.data,
  };
}

/**
 * Enveloppe du payload, ou `null` si elle manque. Seul point d'entrée du contenu :
 * tout ce qui n'est pas une enveloppe est refusé sans autre examen.
 */
function envelopeOf(payload) {
  const env = payload.env;
  return env && typeof env === 'object' ? env : null;
}

function register({ io, socket, sid, limited }) {
  socket.on('room:message', async (payload = {}) => {
    const id = sid();
    if (!id) return;
    if (await limited()) return socket.emit('error:rate');
    const roomId = clamp(payload.roomId, 32);
    if (!socket.data.rooms.has(roomId)) return;
    if (!(await rooms.isMember(roomId, id))) return;
    if (!(await rooms.getRoom(roomId))) return;

    const env = envelopeOf(payload);
    if (!env) return;
    const isMedia = payload.kind === 'media';
    if (isMedia && !payload.data) return;

    const me = await sessions.getSession(id);
    // `id` de message généré SERVEUR (non forgeable par le client) : cible du retrait ciblé.
    const base = { id: genId(), roomId, fromId: id, fromPseudo: me ? me.pseudo : '?', ts: payload.ts || null };
    const body = isMedia ? { ...mediaFields(payload), env } : { kind: 'text', env };

    io.to(`room:${roomId}`).emit('room:message', { ...base, enc: '1', ke: keyEpoch(payload), ...body });
    /**
     * Prise de parole actée dans le même geste que la diffusion : c'est elle qui rendra
     * le départ annonçable (cf. `announceLeave`). Marquée à la DIFFUSION et non à la
     * tentative — un message rejeté plus haut (non membre, sans enveloppe, hors quota)
     * n'a été lu par personne, il ne doit donc pas donner droit à un « est sorti·e ».
     */
    socket.data.spoke.add(roomId);

    // Aucune trace de la RÉPONSE CITÉE ici : la référence est scellée dans l'enveloppe
    // (cf. `frontend/src/lib/body.ts`), le serveur ignore donc jusqu'au graphe des
    // réponses. Un `replyTo` en clair dans le payload est simplement laissé de côté.
  });

  /**
   * MODIFICATION d'un message déjà diffusé — relais opaque, comme l'envoi.
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
    if (!(await rooms.getRoom(roomId))) return;
    const messageId = clamp(payload.messageId, 32);
    if (!messageId) return;
    const env = envelopeOf(payload);
    if (!env) return;

    io.to(`room:${roomId}`).emit('room:edited', {
      roomId,
      messageId,
      fromId: id,
      enc: '1',
      ke: keyEpoch(payload),
      env,
    });
  });
}

module.exports = { register };
