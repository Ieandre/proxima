'use strict';

const crypto = require('crypto');
const config = require('./config');
const { clamp, ack } = require('./protocol');
const moderation = require('./domain/moderation');
const metrics = require('./metrics');
const purge = require('./domain/purge');
const rooms = require('./domain/rooms');
const roomActions = require('./room-actions');
const security = require('./security');
const { SLUG_RE, seedAtBoot } = require('./domain/permanent-rooms');

/**
 * Console opérateur. Namespace Socket.IO SÉPARÉ `/admin`,
 * authentifié par un jeton unique (`config.operatorSecret`). Surface strictement
 * segmentée du namespace public : aucun événement admin n'est écouté ailleurs,
 * et le namespace est INERTE si `OPERATOR_SECRET` n'est pas configuré.
 *
 * L'opérateur ne voit que des données déjà non sensibles (contenu signalé +
 * pseudo + horodatage, JAMAIS d'IP — cf. moderation.js).
 */

/**
 * Phrase de confirmation de la remise à zéro. Un mot à taper plutôt qu'un second clic :
 * le geste est irréversible et global, il doit coûter une intention explicite.
 */
const RESET_PHRASE = 'REINITIALISER';

/**
 * Comparaison à TEMPS CONSTANT de deux secrets. Le hachage SHA-256 préalable
 * égalise la longueur des buffers (évite la fuite de longueur et le throw de
 * timingSafeEqual sur des tailles différentes). Secret vide => toujours faux.
 */
function tokensMatch(provided, expected) {
  if (!expected) return false; // secret non configuré -> console inerte
  const a = crypto.createHash('sha256').update(String(provided == null ? '' : provided)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Middleware d'authentification du namespace /admin (extrait pour testabilité). */
function authMiddleware(socket, next) {
  const token = socket && socket.handshake && socket.handshake.auth ? socket.handshake.auth.token : undefined;
  if (tokensMatch(token, config.operatorSecret)) return next();
  return next(new Error('unauthorized'));
}

function registerAdminNamespace(io) {
  if (!config.operatorSecret) {
    console.warn('[admin] OPERATOR_SECRET non défini — console opérateur désactivée (namespace /admin inerte).');
  }
  const admin = io.of('/admin');
  admin.use(authMiddleware);

  // Tableau de bord (métriques AGRÉGÉES, zéro PII) : diffusion périodique tant
  // qu'au moins un opérateur est connecté À CETTE instance. On ne calcule rien
  // quand la console est vide (évite un balayage Redis inutile). Timer `unref`
  // pour ne jamais retenir le processus.
  let operatorCount = 0;
  async function broadcastMetrics() {
    if (operatorCount === 0) return;
    try {
      admin.to('operators').emit('admin:metrics', await metrics.snapshot());
    } catch (err) {
      console.error('[admin:metrics]', err.message);
    }
  }

  /**
   * Liste des salons — même cadence et même garde que les métriques : un salon naît et
   * meurt en permanence, une liste qu'il faut rafraîchir à la main serait fausse la
   * plupart du temps. Séparée des métriques parce qu'elle nomme des salons, ce que
   * `metrics.js` s'interdit (compteurs uniquement) ; les deux vont sur le même tick pour
   * ne pas doubler les réveils.
   */
  async function broadcastRooms() {
    if (operatorCount === 0) return;
    try {
      admin.to('operators').emit('admin:rooms', { rooms: await rooms.listAll() });
    } catch (err) {
      console.error('[admin:rooms]', err.message);
    }
  }

  async function broadcastDashboard() {
    await broadcastMetrics();
    await broadcastRooms();
  }

  const dashboardTimer = setInterval(broadcastDashboard, config.metrics.refreshMs);
  if (typeof dashboardTimer.unref === 'function') dashboardTimer.unref();

  admin.on('connection', async (socket) => {
    socket.join('operators');
    operatorCount += 1;
    socket.on('disconnect', () => {
      operatorCount = Math.max(0, operatorCount - 1);
    });
    try {
      socket.emit('admin:snapshot', { reports: await moderation.listReports() });
    } catch (err) {
      console.error('[admin:snapshot]', err.message);
    }
    // Premier instantané immédiat (l'opérateur voit les chiffres sans attendre le tick).
    try {
      socket.emit('admin:metrics', await metrics.snapshot());
    } catch (err) {
      console.error('[admin:metrics]', err.message);
    }
    try {
      socket.emit('admin:rooms', { rooms: await rooms.listAll() });
    } catch (err) {
      console.error('[admin:rooms]', err.message);
    }

    // Retrait ciblé d'un message de salon public (best-effort chez les clients connectés).
    socket.on('admin:retract', ({ roomId, messageId } = {}, cb) => {
      const r = clamp(roomId, 32);
      const m = clamp(messageId, 32);
      if (!r || !m) return ack(cb, { error: 'Paramètres manquants.' });
      io.to(`room:${r}`).emit('room:retract', { roomId: r, messageId: m });
      ack(cb, { ok: true });
    });

    // Exclusion d'un participant d'un salon (réutilise handleLeave : RG-05/RG-06).
    socket.on('admin:kick', async ({ roomId, targetId } = {}, cb) => {
      const r = clamp(roomId, 32);
      const t = clamp(targetId, 32);
      if (!r || !t) return ack(cb, { error: 'Paramètres manquants.' });
      io.to(`user:${t}`).emit('room:kicked', { roomId: r });
      io.in(`user:${t}`).socketsLeave(`room:${r}`);
      await roomActions.handleLeave(io, r, t);
      ack(cb, { ok: true });
      await broadcastRooms();
    });

    // Fermeture d'un salon (miroir du room:close propriétaire).
    socket.on('admin:close', async ({ roomId } = {}, cb) => {
      const r = clamp(roomId, 32);
      if (!r) return ack(cb, { error: 'Paramètres manquants.' });
      io.to(`room:${r}`).emit('room:closed', { roomId: r });
      io.in(`room:${r}`).socketsLeave(`room:${r}`);
      await rooms.deleteRoom(r);
      await roomActions.pushLobby(io);
      ack(cb, { ok: true });
      await broadcastRooms();
    });

    // Rafraîchissement à la demande (le tick s'en charge, ce bouton sert à ne pas
    // attendre quand on vient d'agir).
    socket.on('admin:rooms:refresh', async (_payload, cb) => {
      ack(cb, { ok: true, rooms: await rooms.listAll() });
    });

    /**
     * Composition d'UN salon. Volontairement absente de `admin:rooms` : la liste dit
     * COMBIEN, le dépliage dit QUI. Afficher en permanence les présents de tous les
     * salons ferait de la console un poste d'observation ; les pseudos et les
     * identifiants de session ne sont exposés que sur le salon que l'opérateur ouvre —
     * et c'est de toute façon ce qu'exige `admin:kick`, qui a besoin d'un identifiant.
     */
    socket.on('admin:room:members', async ({ roomId } = {}, cb) => {
      const r = clamp(roomId, 32);
      if (!r) return ack(cb, { error: 'Paramètres manquants.' });
      const room = await rooms.getRoom(r);
      if (!room) return ack(cb, { error: 'Salon introuvable.' });
      ack(cb, {
        ok: true,
        roomId: r,
        owner: await rooms.ownerOf(r),
        members: await rooms.memberProfiles(r),
      });
    });

    // Exclusion volatile best-effort : on déconnecte la session — son propre handler
    // `disconnect` nettoie proprement tous ses salons (RG-05/RG-06). Le set mod:bans
    // empêche un re-join tant que la (même) session vit. Contournable par rechargement.
    socket.on('admin:ban', async ({ sessionId } = {}, cb) => {
      const sId = clamp(sessionId, 32);
      if (!sId) return ack(cb, { error: 'Session manquante.' });
      await moderation.banSession(sId);
      io.in(`user:${sId}`).disconnectSockets(true);
      ack(cb, { ok: true });
    });

    // Réquisition légale : préservation PROSPECTIVE uniquement (gel du sel IP borné).
    socket.on('admin:freeze', async ({ reason } = {}, cb) => {
      security.freezeSalt();
      const incident = await moderation.openIncident(clamp(reason, 200));
      ack(cb, { ok: true, incidentId: incident.id, frozen: security.isSaltFrozen() });
    });

    socket.on('admin:unfreeze', async ({ incidentId } = {}, cb) => {
      security.unfreezeSalt();
      if (incidentId) await moderation.closeIncident(clamp(incidentId, 32));
      ack(cb, { ok: true, frozen: security.isSaltFrozen() });
    });

    // Marque un signalement comme traité (purge).
    socket.on('admin:resolve', async ({ reportId } = {}, cb) => {
      const id = clamp(reportId, 32);
      if (id) await moderation.deleteReport(id);
      ack(cb, { ok: true });
    });

    // ====================================================================
    // SALONS PERMANENTS — gérés EXCLUSIVEMENT par l'opérateur
    // (owner=system : aucune gouvernance utilisateur). Voir
    // ====================================================================

    // Création d'un salon permanent (slug stable, jamais purgé, jamais expiré).
    socket.on('admin:room:create', async ({ slug, name } = {}, cb) => {
      const s = clamp(slug, 32).trim().toLowerCase();
      const n = clamp(name, 32).trim();
      if (!SLUG_RE.test(s)) return ack(cb, { error: 'Slug invalide (a-z, 0-9, tiret ; 32 caractères max).' });
      if (n.length < 2) return ack(cb, { error: 'Nom de salon trop court.' });
      if (await rooms.getRoom(s)) return ack(cb, { error: 'Un salon avec ce slug existe déjà.' });
      await rooms.createPersistentRoom({ slug: s, name: n });
      ack(cb, { ok: true, slug: s });
      await roomActions.pushLobby(io);
      await broadcastRooms();
    });

    // Renommage d'un salon permanent.
    socket.on('admin:room:rename', async ({ slug, name } = {}, cb) => {
      const s = clamp(slug, 32).trim().toLowerCase();
      const n = clamp(name, 32).trim();
      if (n.length < 2) return ack(cb, { error: 'Nom de salon trop court.' });
      const room = await rooms.getRoom(s);
      if (!rooms.isPersistentRoom(room)) return ack(cb, { error: 'Salon permanent introuvable.' });
      await rooms.setName(s, n);
      io.to(`room:${s}`).emit('room:system', { roomId: s, text: 'Le salon a été renommé.' });
      ack(cb, { ok: true });
      await roomActions.pushLobby(io);
      await broadcastRooms();
    });

    // Suppression d'un salon permanent (éjecte les membres connectés, miroir d'admin:close).
    // Rappel : sur un salon listé dans le JSON de seed, la suppression est transitoire
    // (recréé au prochain reboot) ; pour un retrait durable, ôter l'entrée du JSON.
    socket.on('admin:room:remove', async ({ slug } = {}, cb) => {
      const s = clamp(slug, 32).trim().toLowerCase();
      const room = await rooms.getRoom(s);
      if (!rooms.isPersistentRoom(room)) return ack(cb, { error: 'Salon permanent introuvable.' });
      io.to(`room:${s}`).emit('room:closed', { roomId: s });
      io.in(`room:${s}`).socketsLeave(`room:${s}`);
      await rooms.deleteRoom(s);
      ack(cb, { ok: true });
      await roomActions.pushLobby(io);
      await broadcastRooms();
    });

    // ====================================================================
    // REMISE À ZÉRO — geste d'exploitation, global et irréversible
    // ====================================================================

    /**
     * Efface l'état de conversation : sessions, présence, salons, invitations. Jamais
     * `mod:*` (cf. `domain/purge.js`, qui dit ce qui survit et pourquoi). La portée est
     * celle de Redis : GLOBALE, donc toutes les instances d'un coup.
     *
     * Trois gestes, et leur ORDRE est le fond du sujet :
     *  1. effacer ;
     *  2. relever les salons permanents en rejouant le seed — sans quoi les salons
     *     officiels manqueraient jusqu'au prochain redémarrage, un permanent n'étant
     *     recréé qu'au boot (les salons de région, eux, renaissent au premier arrivant) ;
     *  3. couper le namespace PUBLIC, et lui seul : `io.disconnectSockets` ne touche pas
     *     `/admin`, sans quoi l'opérateur se déconnecterait lui-même. En DERNIER, parce
     *     qu'une déconnexion invite le client à se réidentifier aussitôt : une session
     *     neuve créée pendant l'effacement serait emportée par lui. Et ce geste n'est pas
     *     optionnel — sans lui chaque client resterait un fantôme, son heartbeat échouant
     *     en silence sur un hash disparu (`sessions.touch`) sans que rien ne le lui dise.
     *
     * Refusée tant que le sel IP est gelé : une préservation prospective en cours ne doit
     * pas cohabiter avec un effacement massif. La phrase de confirmation est revérifiée
     * ici — le garde-fou de l'interface protège du geste distrait, pas d'un onglet resté
     * ouvert sur une console d'hier.
     */
    socket.on('admin:reset', async ({ confirm } = {}, cb) => {
      if (clamp(confirm, 32) !== RESET_PHRASE) {
        return ack(cb, { error: `Confirmation attendue : tapez ${RESET_PHRASE}.` });
      }
      if (security.isSaltFrozen()) {
        return ack(cb, { error: 'Préservation en cours (sel IP gelé) : dégelez avant de réinitialiser.' });
      }
      const counts = await purge.purgeChatState();
      const seed = await seedAtBoot();
      io.disconnectSockets(true);
      // Trace d'exploitation : un geste opérateur, des décomptes, aucune donnée personnelle.
      console.warn(
        `[admin:reset] état de conversation effacé — ${counts.sessions} session(s), ` +
          `${counts.rooms} salon(s), ${counts.invites} invitation(s) ; ` +
          `${seed.created} salon(s) permanent(s) relevé(s).`,
      );
      ack(cb, { ok: true, ...counts, permanentRooms: seed.created });
      await broadcastDashboard();
    });
  });

  return admin;
}

module.exports = { registerAdminNamespace, authMiddleware, tokensMatch, RESET_PHRASE };
