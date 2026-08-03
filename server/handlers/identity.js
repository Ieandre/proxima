'use strict';

const config = require('../config');
const { clamp, ack, genId } = require('../protocol');
const cities = require('../domain/cities');
const geo = require('../domain/geo');
const sessions = require('../domain/sessions');
const rooms = require('../domain/rooms');

/**
 * IDENTITÉ DE SESSION (§2.1) — pseudo + âge (18+) + ville, puis renommage.
 *
 * Aucune de ces données n'est persistée : la session vit en Redis avec un TTL de
 * 90 s rafraîchi par heartbeat (RG-01), et rien ne survit à la fermeture de
 * l'onglet (RG-02).
 */

/**
 * Rattachement au salon de région : chaque arrivant rejoint
 * automatiquement le salon PERMANENT de sa région administrative, créé à la volée
 * au premier habitant.
 *
 * Best-effort et EXTRAIT du handler : `identify` orchestrait sept choses en 113
 * lignes, dont ce bloc de vingt lignes sous son propre try/catch. Un échec ici ne
 * doit pas empêcher quelqu'un d'entrer — d'où le `null` en repli plutôt qu'un jet.
 *
 * @returns {Promise<{room: object, owner: string, members: object[]}|null>}
 */
async function joinRegionRoom(socket, id, geoCity) {
  try {
    const regionName = cities.regionLabel(geoCity.country, geoCity.region);
    const regionSlug = await rooms.ensureRegionRoom({
      country: geoCity.country,
      code: geoCity.region,
      name: regionName,
    });
    if (!regionSlug) return null;

    await rooms.addMember(regionSlug, id);
    socket.join(`room:${regionSlug}`);
    socket.data.rooms.add(regionSlug);
    const room = await rooms.getRoom(regionSlug);
    const members = await rooms.memberProfiles(regionSlug);
    // Pas de message système « est entré·e » : l'entrée dans le salon de région
    // est automatique. La composition est rafraîchie via
    // broadcastMembers par l'appelant — les présents voient le membre apparaître.
    return { room: rooms.toPublic(room), owner: room.owner, members };
  } catch (err) {
    console.error('[identify:region]', err.message);
    return null;
  }
}

function register({ io, socket, sid, limited, pushLobby, broadcastMembers }) {
  socket.on('identify', async (payload = {}, cb) => {
    try {
      if (sid()) return ack(cb, { error: 'Session déjà active.' });

      const pseudo = clamp(payload.pseudo, 24).trim();
      const age = Number(payload.age);
      const gender = ['F', 'H', 'A'].includes(payload.gender) ? payload.gender : null;
      const cityInput = clamp(payload.city, 80).trim();
      // Identifiant de commune renvoyé par l'autocomplétion (`FR-57463`). 3 675
      // communes françaises partagent leur nom avec une autre : le nom seul
      // désignerait la plus peuplée, pas forcément celle où l'on habite.
      const cityId = clamp(payload.cityId, 24).trim();
      const pub = clamp(payload.pub, 4096); // clé publique E2E (opaque pour le serveur)

      if (pseudo.length < 2) return ack(cb, { error: 'Pseudo trop court (2 caractères minimum).' });
      if (!Number.isInteger(age) || age < config.minAge || age > config.maxAge) {
        return ack(cb, { error: `Accès réservé aux ${config.minAge} ans et plus.` });
      }
      if (!gender) return ack(cb, { error: 'Veuillez indiquer un genre.' });
      const geoCity = cities.resolve({ id: cityId, name: cityInput });
      if (!geoCity) return ack(cb, { error: 'Commune inconnue. Choisissez une commune de la liste.' });
      if (!pub) return ack(cb, { error: 'Clé de chiffrement manquante.' });

      const id = genId();
      socket.data.sessionId = id;
      socket.data.pseudo = pseudo; // mémorisé pour l'indicateur de saisie (évite un accès Redis par frappe)
      await sessions.createSession(id, {
        pseudo,
        age,
        gender,
        city: geoCity.name,
        region: geoCity.region,
        country: geoCity.country,
        countryLabel: geoCity.countryLabel,
        lon: geoCity.lon,
        lat: geoCity.lat,
        pub,
      });
      await geo.addPresence(id, geoCity.lon, geoCity.lat);
      socket.join(`user:${id}`);
      socket.join('lobby');

      const me = sessions.toPublic({
        id,
        pseudo,
        age,
        gender,
        city: geoCity.name,
        region: geoCity.region,
        country: geoCity.country,
        countryLabel: geoCity.countryLabel,
        pub,
      });

      const homeRoom = await joinRegionRoom(socket, id, geoCity);

      // `onion` n'est PAS dans `me` : c'est un état de la connexion, visible de
      // soi seul et jamais diffusé aux autres présents.
      // Le publier dans `sessions.toPublic()` transformerait l'anonymat en signe
      // distinctif — un badge sur les quelques visiteurs Tor d'un salon.
      ack(cb, { ok: true, me, radiusKm: config.radiusKm, homeRoom, onion: !!socket.data.onion });

      // Voisinage + notification mutuelle.
      const neighbours = await geo.nearbyIds(id);
      const profiles = await sessions.publicProfiles(neighbours);
      socket.emit('presence:list', profiles);
      for (const n of profiles) {
        io.to(`user:${n.id}`).emit('presence:add', me);
      }
      // Rafraîchit la composition du salon de région pour les membres déjà présents.
      if (homeRoom) await broadcastMembers(homeRoom.room.id);
      await pushLobby();
    } catch (err) {
      console.error('[identify]', err.message);
      ack(cb, { error: 'Erreur interne.' });
    }
  });

  // ======================================================================
  // RENOMMAGE EN COURS DE SESSION (§2.1)
  // ======================================================================
  // Entrer sans rien taper suppose de pouvoir se nommer ensuite : on arrive sous
  // un pseudo tiré au sort, et l'on choisit le sien une fois installé.
  //
  // Le changement est ANNONCÉ dans chaque salon rejoint. Sans cette trace, on
  // pourrait gagner la confiance d'un salon sous un nom puis en prendre un autre —
  // ou celui d'un présent — au milieu d'une conversation, sans que personne ne le
  // voie : les messages déjà affichés gardent le pseudo d'alors. L'annonce est ce
  // qui rend le renommage inoffensif. Seul le salon de région y échappe (voir plus bas).
  socket.on('identity:rename', async (payload = {}, cb) => {
    try {
      const id = sid();
      if (!id) return ack(cb, { error: 'Session inconnue.' });
      if (await limited()) return ack(cb, { error: 'Trop de requêtes. Réessayez dans un instant.' });

      const pseudo = clamp(payload.pseudo, 24).trim();
      if (pseudo.length < 2) return ack(cb, { error: 'Pseudo trop court (2 caractères minimum).' });

      const before = socket.data.pseudo || '';
      // Même pseudo : rien à annoncer, et surtout rien à faire consommer au délai.
      if (pseudo === before) return ack(cb, { ok: true, me: await sessions.getPublicProfile(id) });

      const now = Date.now();
      const libre = (socket.data.renamedAt || 0) + config.renameCooldownMs;
      if (now < libre) {
        return ack(cb, { error: `Encore ${Math.ceil((libre - now) / 1000)} s avant de pouvoir changer.` });
      }

      if (!(await sessions.setPseudo(id, pseudo))) return ack(cb, { error: 'Session expirée.' });
      socket.data.pseudo = pseudo; // cache de l'indicateur de saisie (cf. identify)
      socket.data.renamedAt = now;

      const me = await sessions.getPublicProfile(id);
      ack(cb, { ok: true, me });

      // Voisinage : mise à jour silencieuse. `presence:add` déclencherait chez les
      // autres l'annonce « est apparu·e à proximité », qui serait un mensonge.
      for (const n of await geo.nearbyIds(id)) {
        io.to(`user:${n}`).emit('presence:update', me);
      }

      // Salons : l'annonce, puis la composition rafraîchie.
      //
      // Le salon de région est muet, comme il l'est déjà sur les entrées et les
      // sorties : on ne l'a pas choisi, on y est rattaché d'office avec toute une
      // région, et l'annonce y coûterait plus de bruit qu'elle n'apporte de garde-fou.
      // La composition, elle, est rafraîchie partout — la liste des présents ne doit
      // jamais afficher un nom périmé.
      for (const roomId of socket.data.rooms) {
        if (!rooms.isRegionRoomId(roomId)) {
          io.to(`room:${roomId}`).emit('room:system', {
            roomId,
            text: `${before || 'Quelqu\'un'} s'appelle désormais ${pseudo}.`,
          });
        }
        await broadcastMembers(roomId);
      }
    } catch (err) {
      console.error('[identity:rename]', err.message);
      ack(cb, { error: 'Erreur interne.' });
    }
  });
}

module.exports = { register };
