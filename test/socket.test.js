'use strict';

// --- Configuration d'environnement AVANT tout require (config.js lit process.env
//     au chargement, une seule fois) -----------------------------------------
process.env.MOD_KEYWORDS = 'zzzinterdit'; // mot-clé de test pour le filtre de salon public
process.env.ENCRYPTED_ROOM_MAX_MEMBERS = '2'; // plafond bas pour tester « Salon complet »

const { test, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');

// Injecte le fake Redis AVANT de charger la chaîne serveur.
const { fake } = require('./helpers/inject-redis');
const { createHarness } = require('./helpers/socket-harness');

const { registerHandlers } = require('../server/handlers');
const config = require('../server/config');
const rooms = require('../server/domain/rooms');
const sessions = require('../server/domain/sessions');
const moderation = require('../server/domain/moderation');

// Un harness neuf par test : évite toute fuite d'appartenance de room entre tests.
let io;
let connect;
beforeEach(() => {
  fake.__reset();
  const h = createHarness();
  io = h.io;
  connect = h.connect;
  registerHandlers(io);
});

// ---------------------------------------------------------------------------
// Aides
// ---------------------------------------------------------------------------
const ALICE = { pseudo: 'Alice', age: 30, gender: 'F', city: 'Paris', pub: 'PUB_ALICE' };
const BOB = { pseudo: 'Bob', age: 27, gender: 'H', city: 'Paris', pub: 'PUB_BOB' };

async function identify(sock, overrides = {}) {
  return sock.rpc('identify', { ...ALICE, ...overrides });
}

/** Crée un socket identifié ; renvoie { sock, id }. */
async function joinAs(profile, opts = {}) {
  const sock = connect(opts);
  const ack = await sock.rpc('identify', { ...ALICE, ...profile });
  return { sock, id: sock.data.sessionId, ack };
}

// ===========================================================================
// IDENTIFICATION (§2.1)
// ===========================================================================
describe('identify', () => {
  test('succès : crée la session, la présence, rejoint user+lobby et accuse ok', async () => {
    const sock = connect();
    const ack = await identify(sock);

    assert.equal(ack.ok, true);
    assert.equal(ack.radiusKm, config.radiusKm);
    assert.equal(ack.me.pseudo, 'Alice');
    assert.equal(ack.me.city, 'Paris');
    assert.equal(ack.me.pub, 'PUB_ALICE');
    assert.ok(ack.me.id, 'un id de session est attribué');

    // Session persistée dans le (fake) Redis.
    const stored = await sessions.getSession(sock.data.sessionId);
    assert.equal(stored.pseudo, 'Alice');
    // Rejoint les rooms attendues.
    assert.ok(io.hub.members(`user:${sock.data.sessionId}`).has(sock));
    assert.ok(io.hub.members('lobby').has(sock));
  });

  test('rejette une seconde identification sur le même socket', async () => {
    const sock = connect();
    await identify(sock);
    const ack = await identify(sock, { pseudo: 'Alice2' });
    assert.match(ack.error, /déjà active/);
  });

  test('rejette un pseudo trop court', async () => {
    const ack = await identify(connect(), { pseudo: 'A' });
    assert.match(ack.error, /trop court/);
  });

  test('rejette un mineur (RG-04)', async () => {
    const ack = await identify(connect(), { age: 17 });
    assert.match(ack.error, /18 ans/);
  });

  test('rejette un âge hors bornes', async () => {
    const ack = await identify(connect(), { age: 200 });
    assert.match(ack.error, /18 ans/);
  });

  test('rejette un genre absent/invalide', async () => {
    const ack = await identify(connect(), { gender: 'X' });
    assert.match(ack.error, /genre/);
  });

  test('rejette une commune inconnue', async () => {
    const ack = await identify(connect(), { city: 'Atlantide' });
    assert.match(ack.error, /Commune inconnue/);
  });

  test('l’identifiant de commune tranche entre les homonymes', async () => {
    // Douze communes s'appellent Sainte-Colombe : envoyer le nom seul mènerait à la
    // plus peuplée (Rhône), pas à celle qu'on a choisie dans la liste.
    const sock = connect();
    const ack = await identify(sock, { city: 'Sainte-Colombe', cityId: 'FR-05135' });
    assert.equal(ack.ok, true);
    assert.equal(ack.me.city, 'Sainte-Colombe');
    // La région suivie est bien celle des Hautes-Alpes, non celle du Rhône.
    assert.equal((await sessions.getSession(sock.data.sessionId)).region, '93');
  });

  test('rejette une clé publique E2E manquante', async () => {
    const ack = await identify(connect(), { pub: '' });
    assert.match(ack.error, /chiffrement manquante/);
  });

  test('deux voisins (même ville) se voient mutuellement', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.1' });
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.2' });

    // B reçoit la liste de présence contenant A.
    const list = b.sock.last('presence:list');
    assert.ok(Array.isArray(list));
    assert.ok(list.some((p) => p.id === a.id));
    // A est notifié de l'arrivée de B.
    const add = a.sock.received('presence:add').map((m) => m.payload.id);
    assert.ok(add.includes(b.id));
  });

  test('un lointain (autre région) n\'est pas un voisin', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.3' });
    const far = await joinAs({ ...BOB, city: 'Lyon' }, { forwardedFor: '203.0.113.4' });
    const list = far.sock.last('presence:list') || [];
    assert.ok(!list.some((p) => p.id === a.id), 'Paris est hors rayon de Lyon');
  });
});

// ===========================================================================
// RENOMMAGE EN COURS DE SESSION (§2.1)
// ===========================================================================
describe('identity:rename', () => {
  test('succès : met à jour la session, le cache de frappe et accuse le nouveau profil', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.60' });
    const ack = await a.sock.rpc('identity:rename', { pseudo: 'Alicia' });

    assert.equal(ack.ok, true);
    assert.equal(ack.me.pseudo, 'Alicia');
    assert.equal(ack.me.id, a.id, 'le renommage ne change pas l’identifiant de session');
    assert.equal((await sessions.getSession(a.id)).pseudo, 'Alicia');
    // Cache consulté à chaque frappe (indicateur de saisie) : il doit suivre.
    assert.equal(a.sock.data.pseudo, 'Alicia');
  });

  test('exige une session', async () => {
    const ack = await connect().rpc('identity:rename', { pseudo: 'Fantôme' });
    assert.match(ack.error, /Session inconnue/);
  });

  test('rejette un pseudo trop court', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.61' });
    const ack = await a.sock.rpc('identity:rename', { pseudo: 'A' });
    assert.match(ack.error, /trop court/);
    assert.equal((await sessions.getSession(a.id)).pseudo, 'Alice');
  });

  test('impose un délai entre deux changements', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.62' });
    assert.equal((await a.sock.rpc('identity:rename', { pseudo: 'Alicia' })).ok, true);
    const trop = await a.sock.rpc('identity:rename', { pseudo: 'Alix' });
    assert.match(trop.error, /Encore \d+ s/);
    assert.equal((await sessions.getSession(a.id)).pseudo, 'Alicia');
  });

  test('le même pseudo n’annonce rien et ne consomme pas le délai', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.63' });
    const ack = await a.sock.rpc('identity:rename', { pseudo: 'Alice' });
    assert.equal(ack.ok, true);
    // Un vrai changement reste possible dans la foulée.
    assert.equal((await a.sock.rpc('identity:rename', { pseudo: 'Alicia' })).ok, true);
  });

  test('les voisins sont mis à jour sans être avertis d’une arrivée', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.64' });
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.65' });
    b.sock.clearInbox();

    await a.sock.rpc('identity:rename', { pseudo: 'Alicia' });

    assert.equal(b.sock.last('presence:update').pseudo, 'Alicia');
    assert.equal(b.sock.last('presence:update').id, a.id);
    // `presence:add` déclencherait « est apparu·e à proximité » : ce serait faux.
    assert.equal(b.sock.count('presence:add'), 0);
    // On ne s'annonce pas à soi-même.
    assert.equal(a.sock.count('presence:update'), 0);
  });

  test('le salon est prévenu du changement et sa composition rafraîchie', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.66' });
    const create = await owner.sock.rpc('room:create', { name: 'Salon Renommage', type: 'public' });
    const roomId = create.room.id;
    const member = await joinAs(BOB, { forwardedFor: '203.0.113.67' });
    await member.sock.rpc('room:join', { roomId });
    member.sock.clearInbox();

    await owner.sock.rpc('identity:rename', { pseudo: 'Alicia' });

    // L'annonce est ce qui empêche de changer de nom au milieu d'une conversation
    // sans que personne ne le voie.
    const sys = member.sock.last('room:system');
    assert.equal(sys.roomId, roomId);
    assert.match(sys.text, /Alice s'appelle désormais Alicia\./);
    const membres = member.sock.last('room:members');
    assert.ok(
      membres.members.some((m) => m.id === owner.id && m.pseudo === 'Alicia'),
      'la composition diffusée porte le nouveau pseudo',
    );
  });

  test('le salon de région reste muet, mais sa composition suit', async () => {
    // Muet comme il l'est déjà sur les entrées et les sorties : on n'a pas choisi ce
    // salon, et l'annonce y toucherait toute une région.
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.68' }); // Paris -> rgn-fr-11
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.69' });
    b.sock.clearInbox();

    await a.sock.rpc('identity:rename', { pseudo: 'Alicia' });

    const sys = b.sock.received('room:system').filter((m) => m.payload.roomId === 'rgn-fr-11');
    assert.equal(sys.length, 0, 'aucune annonce dans le salon de région');
    const membres = b.sock
      .received('room:members')
      .map((m) => m.payload)
      .filter((p) => p.roomId === 'rgn-fr-11')
      .pop();
    assert.ok(
      membres && membres.members.some((m) => m.id === a.id && m.pseudo === 'Alicia'),
      'la liste des présents ne doit jamais afficher un nom périmé',
    );
  });
});

// ===========================================================================
// SALON DE RÉGION (design 2026-07-23) — rattachement automatique à l'arrivée
// ===========================================================================
describe('salon de région', () => {
  test('identify : rattache et fait rejoindre le salon permanent de la région', async () => {
    const sock = connect();
    const ack = await identify(sock); // Paris -> FR|11 -> rgn-fr-11

    assert.ok(ack.homeRoom, 'un salon de région doit être renvoyé');
    assert.equal(ack.homeRoom.room.id, 'rgn-fr-11');
    assert.equal(ack.homeRoom.room.name, 'Île-de-France');
    assert.equal(ack.homeRoom.owner, 'system');
    // Le socket est bien membre de la room Socket.IO du salon de région.
    assert.ok(io.hub.members('room:rgn-fr-11').has(sock));
    // Le salon existe côté Redis et compte l'arrivant.
    assert.equal(await rooms.memberCount('rgn-fr-11'), 1);
    assert.ok(ack.homeRoom.members.some((m) => m.id === sock.data.sessionId));
    // Arrivée automatique : AUCUN message système « est entré·e » (design 2026-07-23).
    assert.equal(sock.received('room:system').length, 0);
  });

  test('aucun message système à l\'arrivée ni au départ du salon de région', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.20' });
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.21' });
    // A ne reçoit pas de « Bob est entré·e » (mais bien la composition à jour).
    assert.equal(a.sock.received('room:system').length, 0);
    assert.ok(a.sock.received('room:members').length > 0);
    // Départ de B : A ne reçoit pas de « Bob est sorti·e ».
    a.sock.clearInbox();
    await b.sock.deliver('disconnect');
    assert.equal(a.sock.received('room:system').length, 0);
  });

  test('deux arrivants de la même région partagent le salon', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.5' });
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.6' });
    assert.equal(b.ack.homeRoom.room.id, 'rgn-fr-11');
    assert.equal(await rooms.memberCount('rgn-fr-11'), 2);
    // B voit A dans la composition renvoyée à son arrivée.
    assert.ok(b.ack.homeRoom.members.some((m) => m.id === a.id));
  });

  test('deux régions distinctes -> deux salons distincts', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.7' }); // Paris
    const l = await joinAs({ ...BOB, city: 'Lyon' }, { forwardedFor: '203.0.113.8' }); // Auvergne-Rhône-Alpes
    assert.equal(a.ack.homeRoom.room.id, 'rgn-fr-11');
    assert.equal(l.ack.homeRoom.room.id, 'rgn-fr-84');
    assert.equal(l.ack.homeRoom.room.name, 'Auvergne-Rhône-Alpes');
  });

  test('le salon de région d\'autrui reste invisible dans le listing public', async () => {
    await joinAs(ALICE, { forwardedFor: '203.0.113.30' }); // Paris -> rgn-fr-11
    const lyon = await joinAs({ ...BOB, city: 'Lyon' }, { forwardedFor: '203.0.113.31' }); // -> rgn-fr-84
    const list = (await lyon.sock.rpcCb('room:list')).rooms;
    const ids = list.map((r) => r.id);
    // Ni le salon d'Île-de-France (autre région), ni même le sien ne figurent dans l'annuaire.
    assert.ok(!ids.includes('rgn-fr-11'), 'le salon de région d\'autrui ne doit pas être listé');
    assert.ok(!ids.some((id) => id.startsWith('rgn-')), 'aucun salon de région ne doit apparaître dans le listing');
  });

  test('le salon de région survit au départ de son dernier membre (permanent)', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.9' });
    assert.equal(await rooms.memberCount('rgn-fr-11'), 1);
    await a.sock.deliver('disconnect');
    // RG-05 exempté : le salon permanent reste, vide.
    const room = await rooms.getRoom('rgn-fr-11');
    assert.ok(room, 'le salon de région ne doit pas être supprimé quand il se vide');
    assert.equal(room.owner, 'system');
    assert.equal(await rooms.memberCount('rgn-fr-11'), 0);
  });
});

// ===========================================================================
// PRÉSENCE / HEARTBEAT
// ===========================================================================
describe('présence & heartbeat', () => {
  test('heartbeat sans session est un no-op silencieux', async () => {
    const sock = connect();
    await assert.doesNotReject(() => sock.deliver('heartbeat'));
  });

  test('presence:list rafraîchit et renvoie les profils voisins', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.5' });
    await joinAs(BOB, { forwardedFor: '203.0.113.6' });
    const ack = await a.sock.rpcCb('presence:list');
    assert.equal(ack.ok, true);
    assert.ok(ack.profiles.some((p) => p.pseudo === 'Bob'));
  });

  test('presence:list non identifié est rejeté', async () => {
    const ack = await connect().rpcCb('presence:list');
    assert.match(ack.error, /Non identifié/);
  });
});

// ===========================================================================
// MESSAGES PRIVÉS chiffrés E2E (§2.3, RG-07) — le serveur relaie une enveloppe opaque
// ===========================================================================
describe('pm:send', () => {
  test('relaie une enveloppe opaque au destinataire, sans la déchiffrer', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.10' });
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.11' });
    const env = { n: 'NONCE', c: 'CIPHER', pub: 'PUB_ALICE' };

    await a.sock.deliver('pm:send', { toId: b.id, env, ts: 42 });

    const recv = b.sock.last('pm:recv');
    assert.equal(recv.fromId, a.id);
    assert.equal(recv.fromPseudo, 'Alice');
    assert.equal(recv.kind, 'text');
    assert.deepEqual(recv.env, env, 'enveloppe transmise telle quelle (serveur aveugle)');
  });

  test('média : exige des octets `data`', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.12' });
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.13' });
    // Sans data -> rien n'est relayé.
    await a.sock.deliver('pm:send', { toId: b.id, env: { n: 'N', c: 'C', pub: 'P' }, kind: 'media' });
    assert.equal(b.sock.count('pm:recv'), 0);
    // Avec data -> relayé.
    await a.sock.deliver('pm:send', { toId: b.id, env: { n: 'N', c: 'C', pub: 'P' }, kind: 'media', data: 'BYTES' });
    assert.equal(b.sock.last('pm:recv').kind, 'media');
  });

  test('destinataire inconnu -> pm:undeliverable à l\'émetteur', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.14' });
    await a.sock.deliver('pm:send', { toId: 'inconnu', env: { n: 'N', c: 'C', pub: 'P' } });
    assert.equal(a.sock.last('pm:undeliverable').toId, 'inconnu');
  });

  test('ignoré si non identifié ou enveloppe absente', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.15' });
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.16' });
    await a.sock.deliver('pm:send', { toId: b.id }); // pas d'enveloppe
    assert.equal(b.sock.count('pm:recv'), 0);
  });

  test('rate limit : au-delà du plafond -> error:rate', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '198.51.100.99' });
    const b = await joinAs(BOB, { forwardedFor: '198.51.100.98' });
    const env = { n: 'N', c: 'C', pub: 'P' };
    for (let i = 0; i < config.rateLimit.maxEvents; i++) {
      await a.sock.deliver('pm:send', { toId: b.id, env });
    }
    a.sock.clearInbox();
    await a.sock.deliver('pm:send', { toId: b.id, env });
    assert.ok(a.sock.count('error:rate') > 0);
  });
});

// ===========================================================================
// SIGNALEMENT de MP (RG-07 : contenu fourni volontairement, marqué unverified)
// ===========================================================================
describe('pm:report', () => {
  test('crée un signalement non vérifié et notifie l\'opérateur', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.20' });
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.21' });
    const ack = await a.sock.rpc('pm:report', {
      peerId: b.id,
      messageId: 'msg1',
      content: 'propos signalé',
      reason: 'harassment',
    });
    assert.equal(ack.ok, true);
    const report = io.adminEmits.find((e) => e.event === 'report:new');
    assert.ok(report, 'diffusé à la console opérateur');
    assert.equal(report.payload.report.scope, 'pm');
    assert.equal(report.payload.report.unverified, true);
    assert.equal(report.payload.report.reason, 'harassment');
  });

  test('signalement incomplet rejeté', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.22' });
    const ack = await a.sock.rpc('pm:report', { peerId: '', content: '' });
    assert.match(ack.error, /incomplet/);
  });

  test('déduplication : un même signaleur ne signale qu\'une fois le même message', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.23' });
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.24' });
    const payload = { peerId: b.id, messageId: 'dup', content: 'x', reason: 'spam' };
    await a.sock.rpc('pm:report', payload);
    const before = io.adminEmits.length;
    await a.sock.rpc('pm:report', payload); // doublon
    assert.equal(io.adminEmits.length, before, 'aucun nouveau report:new');
  });
});

// ===========================================================================
// CLÉ PUBLIQUE D'UN CO-PRÉSENT (design 2026-08-03-mp-depuis-les-presents)
// Condition d'accès : le salon partagé. Rien d'autre n'est divulgué.
// ===========================================================================
describe('pm:key', () => {
  /** Alice propriétaire d'un salon, Bob entré dedans. */
  async function salonPartage(suffix) {
    const a = await joinAs(ALICE, { forwardedFor: `198.51.100.${suffix}0` });
    const b = await joinAs(BOB, { forwardedFor: `198.51.100.${suffix}1` });
    const { room } = await a.sock.rpc('room:create', { name: 'Salon Voisins', type: 'public' });
    await b.sock.rpc('room:join', { roomId: room.id });
    return { a, b, roomId: room.id };
  }

  test('co-présents : la clé est révélée, et rien de plus', async () => {
    const { a, b, roomId } = await salonPartage(1);
    const ack = await a.sock.rpc('pm:key', { roomId, peerId: b.id });

    assert.equal(ack.ok, true);
    assert.equal(ack.peer.pub, 'PUB_BOB');
    assert.equal(ack.peer.pseudo, 'Bob');
    // Ni ville, ni âge, ni genre : la liste des présents ne les donne pas, cette
    // demande ne doit pas devenir la porte de service par laquelle ils sortent.
    assert.deepEqual(Object.keys(ack.peer).sort(), ['id', 'pseudo', 'pub']);
  });

  test('demandeur hors du salon : refus (sinon un roomId devine la clé de n’importe qui)', async () => {
    const { b, roomId } = await salonPartage(2);
    const intrus = await joinAs(
      { pseudo: 'Intrus', age: 33, gender: 'A', city: 'Paris', pub: 'PUB_INTRUS' },
      { forwardedFor: '198.51.100.29' },
    );
    const ack = await intrus.sock.rpc('pm:key', { roomId, peerId: b.id });
    assert.match(ack.error, /inaccessible/);
  });

  test('cible hors du salon : refus', async () => {
    const { a, roomId } = await salonPartage(3);
    const ailleurs = await joinAs(
      { pseudo: 'Ailleurs', age: 29, gender: 'F', city: 'Paris', pub: 'PUB_AILLEURS' },
      { forwardedFor: '198.51.100.39' },
    );
    const ack = await a.sock.rpc('pm:key', { roomId, peerId: ailleurs.id });
    assert.match(ack.error, /quitté le salon/);
  });

  test('session évaporée entre-temps : refus explicite', async () => {
    const { a, b, roomId } = await salonPartage(4);
    await sessions.deleteSession(b.id); // onglet fermé, RG-02 — l'appartenance survit un instant
    const ack = await a.sock.rpc('pm:key', { roomId, peerId: b.id });
    assert.match(ack.error, /n'est plus connectée/);
  });

  test('soi-même et demandes incomplètes : refus', async () => {
    const { a, roomId } = await salonPartage(5);
    assert.match((await a.sock.rpc('pm:key', { roomId, peerId: a.id })).error, /vous-même/);
    assert.match((await a.sock.rpc('pm:key', { roomId })).error, /incomplète/);
    assert.match((await a.sock.rpc('pm:key', { peerId: a.id })).error, /incomplète/);
  });

  test('non identifié : refus', async () => {
    const anonyme = connect({ forwardedFor: '198.51.100.59' });
    assert.match((await anonyme.rpc('pm:key', { roomId: 'r', peerId: 'p' })).error, /Non identifié/);
  });
});

// ===========================================================================
// INDICATEUR DE SAISIE
// ===========================================================================
// ===========================================================================
// INVITATION À UNE CONVERSATION PRIVÉE PAR LIEN (design 2026-08-03)
// ===========================================================================
describe('pm:invite', () => {
  const CHARLIE = { pseudo: 'Charlie', age: 41, gender: 'A', city: 'Paris', pub: 'PUB_CHARLIE' };

  test('create -> peek : le pré-vol donne le pseudo de l’hôte sans rien consommer', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.30' });
    const { token } = await a.sock.rpc('pm:invite:create', {});
    assert.ok(token, 'un jeton est renvoyé');

    const b = connect({ forwardedFor: '203.0.113.31' });
    // Deux pré-vols de suite : un lien déroulé par une messagerie (aperçu) ne doit
    // pas mourir avant que son destinataire l'ouvre.
    assert.equal((await b.rpc('pm:invite:peek', { token })).pseudo, 'Alice');
    assert.equal((await b.rpc('pm:invite:peek', { token })).pseudo, 'Alice');
  });

  test('peek : ne demande aucune session (l’invité n’en a pas encore)', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.32' });
    const { token } = await a.sock.rpc('pm:invite:create', {});
    const anonyme = connect({ forwardedFor: '203.0.113.33' });
    assert.equal((await anonyme.rpc('pm:invite:peek', { token })).ok, true);
  });

  test('claim : l’hôte est prévenu, et n’expose PAS son identifiant de session', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.34' });
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.35' });
    const { token } = await a.sock.rpc('pm:invite:create', {});

    const ack = await b.sock.rpc('pm:invite:claim', { token });
    assert.equal(ack.ok, true);
    assert.equal(ack.pseudo, 'Alice');
    // Connaître l'id de session suffirait à écrire sans accord (`pm:send`) : l'accusé
    // ne doit donc rien en dire tant que l'hôte n'a pas confirmé.
    assert.equal(JSON.stringify(ack).includes(a.id), false, "l'accusé ne fuit pas l'id de l'hôte");

    const pending = a.sock.last('pm:invite:pending');
    assert.equal(pending.guest.pseudo, 'Bob');
    assert.equal(pending.guest.pub, 'PUB_BOB');
  });

  test('accept : chacun reçoit le profil public de l’autre, et le lien est consommé', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.36' });
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.37' });
    const { token } = await a.sock.rpc('pm:invite:create', {});
    await b.sock.rpc('pm:invite:claim', { token });

    const ack = await a.sock.rpc('pm:invite:accept', { token });
    assert.equal(ack.peer.pseudo, 'Bob');
    assert.equal(ack.peer.pub, 'PUB_BOB', 'clé publique transmise : sans elle, rien à chiffrer');
    assert.equal(b.sock.last('pm:invite:accepted').peer.pseudo, 'Alice');

    // L'invitation ne vaut que pour cette conversation : elle ne survit pas.
    assert.ok((await a.sock.rpc('pm:invite:accept', { token })).error);
  });

  test('invité disparu avant l’accord : refus marqué `gone` (la fiche doit se retirer)', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.52' });
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.53' });
    const { token } = await a.sock.rpc('pm:invite:create', {});
    await b.sock.rpc('pm:invite:claim', { token });

    await sessions.deleteSession(b.id); // l'invité s'est évaporé entre-temps

    const ack = await a.sock.rpc('pm:invite:accept', { token });
    assert.match(ack.error, /n'est plus connecté/);
    assert.equal(ack.gone, true, 'sans ce drapeau, la fiche proposerait une ouverture impossible');
  });

  test('la place est unique : un second arrivant est éconduit', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.38' });
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.39' });
    const c = await joinAs(CHARLIE, { forwardedFor: '203.0.113.40' });
    const { token } = await a.sock.rpc('pm:invite:create', {});

    assert.equal((await b.sock.rpc('pm:invite:claim', { token })).ok, true);
    const refus = await c.sock.rpc('pm:invite:claim', { token });
    assert.match(refus.error, /déjà occupée/);
    // Et le pré-vol le dit aussi, avant même toute identité.
    assert.match((await c.sock.rpc('pm:invite:peek', { token })).error, /déjà occupée/);
  });

  test('revoke : l’arrivant est prévenu et le lien disparaît', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.41' });
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.42' });
    const { token } = await a.sock.rpc('pm:invite:create', {});
    await b.sock.rpc('pm:invite:claim', { token });

    await a.sock.rpc('pm:invite:revoke', { token });
    assert.equal(b.sock.count('pm:invite:declined'), 1);
    assert.ok((await b.sock.rpc('pm:invite:claim', { token })).error, 'le jeton ne vaut plus rien');
  });

  test('un tiers ne peut ni accepter ni révoquer l’invitation d’autrui', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.43' });
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.44' });
    const c = await joinAs(CHARLIE, { forwardedFor: '203.0.113.45' });
    const { token } = await a.sock.rpc('pm:invite:create', {});
    await b.sock.rpc('pm:invite:claim', { token });

    assert.ok((await c.sock.rpc('pm:invite:accept', { token })).error);
    await c.sock.rpc('pm:invite:revoke', { token });
    // Toujours vivante : l'hôte peut encore confirmer.
    assert.equal((await a.sock.rpc('pm:invite:accept', { token })).ok, true);
  });

  test('hôte disparu : le lien ne vaut plus rien (rendez-vous, pas boîte aux lettres)', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.46' });
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.47' });
    const { token } = await a.sock.rpc('pm:invite:create', {});

    await sessions.deleteSession(a.id); // expiration de session (90 s sans heartbeat)

    assert.match((await b.sock.rpc('pm:invite:peek', { token })).error, /n'est plus connecté/);
    assert.match((await b.sock.rpc('pm:invite:claim', { token })).error, /n'est plus connecté/);
  });

  test('jeton inconnu ou absent -> invitation expirée', async () => {
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.48' });
    assert.match((await b.sock.rpc('pm:invite:peek', { token: 'nexistepas' })).error, /expiré/);
    assert.match((await b.sock.rpc('pm:invite:claim', {})).error, /expiré/);
  });

  test('un seul lien vivant par session : le précédent est retiré', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.49' });
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.50' });
    const premier = (await a.sock.rpc('pm:invite:create', {})).token;
    const second = (await a.sock.rpc('pm:invite:create', {})).token;

    assert.notEqual(premier, second);
    assert.match((await b.sock.rpc('pm:invite:peek', { token: premier })).error, /expiré/);
    assert.equal((await b.sock.rpc('pm:invite:peek', { token: second })).ok, true);
  });

  test('exige une session pour créer, réclamer, accepter ou révoquer', async () => {
    const anonyme = connect({ forwardedFor: '203.0.113.51' });
    for (const event of ['pm:invite:create', 'pm:invite:claim', 'pm:invite:accept', 'pm:invite:revoke']) {
      assert.match((await anonyme.rpc(event, { token: 'x' })).error, /Non identifié/, event);
    }
  });
});

describe('typing', () => {
  test('scope pm : notifie le destinataire', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.30' });
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.31' });
    await a.sock.deliver('typing', { scope: 'pm', toId: b.id });
    const t = b.sock.last('typing');
    assert.equal(t.scope, 'pm');
    assert.equal(t.fromId, a.id);
  });

  test('scope room : diffuse aux autres membres, jamais à soi', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.32' });
    const create = await owner.sock.rpc('room:create', { name: 'Salon Test', type: 'public' });
    const roomId = create.room.id;
    const member = await joinAs(BOB, { forwardedFor: '203.0.113.33' });
    await member.sock.rpc('room:join', { roomId });

    owner.sock.clearInbox();
    member.sock.clearInbox();
    await member.sock.deliver('typing', { scope: 'room', roomId });
    assert.ok(owner.sock.last('typing'), 'le propriétaire reçoit le signal');
    assert.equal(member.sock.count('typing'), 0, 'l\'émetteur ne se reçoit pas');
  });
});

// ===========================================================================
// SALONS — création
// ===========================================================================
describe('room:create', () => {
  test('salon public : ok, invitation fournie, listé au lobby', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.40' });
    const ack = await owner.sock.rpc('room:create', { name: 'Public 1', type: 'public' });
    assert.equal(ack.ok, true);
    assert.equal(ack.room.type, 'public');
    assert.ok(ack.invite, 'un salon public expose une invitation');
    assert.equal(ack.owner, owner.id);
    const list = await rooms.listPublic();
    assert.ok(list.some((r) => r.id === ack.room.id));
  });

  test('salon chiffré : exige verifier+salt, aucune invitation, sel exposé', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.41' });
    const missing = await owner.sock.rpc('room:create', { name: 'Chiffré', encrypted: '1' });
    assert.match(missing.error, /chiffrement manquants/);

    const ack = await owner.sock.rpc('room:create', {
      name: 'Chiffré',
      encrypted: '1',
      verifier: 'VERIF123',
      salt: 'SALT16',
    });
    assert.equal(ack.ok, true);
    assert.equal(ack.room.encrypted, true);
    assert.equal(ack.room.salt, 'SALT16', 'le sel public est exposé');
    assert.equal(ack.invite, undefined, 'un salon chiffré n\'expose pas d\'invitation');
  });

  test('nom trop court rejeté', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.42' });
    const ack = await owner.sock.rpc('room:create', { name: 'A' });
    assert.match(ack.error, /trop court/);
  });

  test('non identifié rejeté', async () => {
    const ack = await connect().rpc('room:create', { name: 'Salon' });
    assert.match(ack.error, /Non identifié/);
  });
});

// ===========================================================================
// SALONS — listing & pré-vol
// ===========================================================================
describe('room:list & room:peek', () => {
  test('room:list renvoie les salons publics', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.43' });
    await owner.sock.rpc('room:create', { name: 'Visible', type: 'public' });
    const ack = await owner.sock.rpcCb('room:list');
    assert.equal(ack.ok, true);
    assert.ok(ack.rooms.some((r) => r.name === 'Visible'));
  });

  test('room:peek expose nom + sel d\'un salon chiffré, jamais le verifier', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.44' });
    const create = await owner.sock.rpc('room:create', {
      name: 'Secret', encrypted: '1', verifier: 'V', salt: 'SEL',
    });
    const peeker = await joinAs(BOB, { forwardedFor: '203.0.113.45' });
    const ack = await peeker.sock.rpc('room:peek', { roomId: create.room.id });
    assert.equal(ack.ok, true);
    assert.equal(ack.name, 'Secret');
    assert.equal(ack.encrypted, true);
    assert.equal(ack.salt, 'SEL');
    assert.equal('verifier' in ack, false);
  });

  test('room:peek d\'un salon introuvable', async () => {
    const peeker = await joinAs(ALICE, { forwardedFor: '203.0.113.46' });
    const ack = await peeker.sock.rpc('room:peek', { roomId: 'nope' });
    assert.match(ack.error, /introuvable/);
  });
});

// ===========================================================================
// SALONS — accès (join)
// ===========================================================================
describe('room:join', () => {
  test('salon public : join ok, arrivée MUETTE, diffusion des membres', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.50' });
    const create = await owner.sock.rpc('room:create', { name: 'Ouvert', type: 'public' });
    const roomId = create.room.id;
    const member = await joinAs(BOB, { forwardedFor: '203.0.113.51' });
    owner.sock.clearInbox();

    const ack = await member.sock.rpc('room:join', { roomId });
    assert.equal(ack.ok, true);
    assert.equal(ack.owner, owner.id);
    assert.ok(ack.members.some((m) => m.id === member.id));
    // Aucune annonce d'arrivée, dans aucun salon : la présence se lit dans la
    // composition, que le propriétaire reçoit bien.
    assert.equal(owner.sock.received('room:system').length, 0);
    assert.ok(owner.sock.last('room:members').members.some((m) => m.id === member.id));
  });

  test('salon chiffré : verifier correct requis + plafond de membres', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.52' });
    const create = await owner.sock.rpc('room:create', {
      name: 'Groupe', encrypted: '1', verifier: 'GOOD', salt: 'S',
    });
    const roomId = create.room.id;

    const bad = await joinAs(BOB, { forwardedFor: '203.0.113.53' });
    const badAck = await bad.sock.rpc('room:join', { roomId, verifier: 'WRONG' });
    assert.match(badAck.error, /Mot de passe incorrect/);

    const okAck = await bad.sock.rpc('room:join', { roomId, verifier: 'GOOD' });
    assert.equal(okAck.ok, true); // 2e membre = plafond (ENCRYPTED_ROOM_MAX_MEMBERS=2)

    const third = await joinAs({ ...ALICE, pseudo: 'Carol' }, { forwardedFor: '203.0.113.54' });
    const fullAck = await third.sock.rpc('room:join', { roomId, verifier: 'GOOD' });
    assert.match(fullAck.error, /complet/);
  });

  test('salon privé : mot de passe ou invitation requis', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.55' });
    const create = await owner.sock.rpc('room:create', { name: 'Privé', type: 'private', password: 'secret' });
    const roomId = create.room.id;
    const invite = create.invite;

    const guest = await joinAs(BOB, { forwardedFor: '203.0.113.56' });
    const bad = await guest.sock.rpc('room:join', { roomId, password: 'faux' });
    assert.match(bad.error, /invalide/);

    const okPass = await guest.sock.rpc('room:join', { roomId, password: 'secret' });
    assert.equal(okPass.ok, true);

    // Un autre invité passe par le jeton d'invitation.
    const guest2 = await joinAs({ ...ALICE, pseudo: 'Dan' }, { forwardedFor: '203.0.113.57' });
    const okInvite = await guest2.sock.rpc('room:join', { roomId, invite });
    assert.equal(okInvite.ok, true);
  });

  test('salon introuvable rejeté', async () => {
    const guest = await joinAs(ALICE, { forwardedFor: '203.0.113.58' });
    const ack = await guest.sock.rpc('room:join', { roomId: 'nope' });
    assert.match(ack.error, /introuvable/);
  });

  test('session bannie rejetée (exclusion volatile)', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.59' });
    const create = await owner.sock.rpc('room:create', { name: 'Ouvert2', type: 'public' });
    const guest = await joinAs(BOB, { forwardedFor: '203.0.113.60' });
    await moderation.banSession(guest.id);
    const ack = await guest.sock.rpc('room:join', { roomId: create.room.id });
    assert.match(ack.error, /modération/);
  });
});

// ===========================================================================
// SALONS — sortie : annoncée pour qui a parlé, muette pour qui n'a fait que passer
// ===========================================================================
describe('room:leave', () => {
  /** Un salon public tenu par ALICE, dans lequel BOB est entré. */
  async function pair(offset) {
    const owner = await joinAs(ALICE, { forwardedFor: `203.0.113.${offset}` });
    const create = await owner.sock.rpc('room:create', { name: 'Passage', type: 'public' });
    const roomId = create.room.id;
    const visitor = await joinAs(BOB, { forwardedFor: `203.0.113.${offset + 1}` });
    await visitor.sock.rpc('room:join', { roomId });
    owner.sock.clearInbox();
    return { owner, visitor, roomId };
  }

  test('sortie MUETTE de qui n\'a rien écrit', async () => {
    const { owner, visitor, roomId } = await pair(150);
    await visitor.sock.deliver('room:leave', { roomId });
    assert.equal(owner.sock.received('room:system').length, 0);
    // La composition, elle, est bien rafraîchie : le présent disparaît de la liste.
    assert.equal(owner.sock.last('room:members').members.some((m) => m.id === visitor.id), false);
  });

  test('sortie ANNONCÉE de qui a pris la parole', async () => {
    const { owner, visitor, roomId } = await pair(152);
    await visitor.sock.deliver('room:message', { roomId, text: 'bonsoir' });
    await visitor.sock.deliver('room:leave', { roomId });
    assert.ok(owner.sock.received('room:system').some((m) => /Bob est sorti·e/.test(m.payload.text)));
  });

  test('la parole reste acquise : sortir, revenir, ressortir sans écrire s\'annonce', async () => {
    const { owner, visitor, roomId } = await pair(154);
    await visitor.sock.deliver('room:message', { roomId, text: 'me revoilà bientôt' });
    await visitor.sock.deliver('room:leave', { roomId });
    await visitor.sock.rpc('room:join', { roomId });
    owner.sock.clearInbox();
    await visitor.sock.deliver('room:leave', { roomId });
    assert.ok(owner.sock.received('room:system').some((m) => /Bob est sorti·e/.test(m.payload.text)));
  });

  test('un message REJETÉ ne vaut pas prise de parole', async () => {
    const { owner, visitor, roomId } = await pair(156);
    // Texte vide : rien n'est diffusé, donc personne ne l'a lu.
    await visitor.sock.deliver('room:message', { roomId, text: '   ' });
    await visitor.sock.deliver('room:leave', { roomId });
    assert.equal(owner.sock.received('room:system').length, 0);
  });

  test('fermeture d\'onglet : même règle que la sortie explicite', async () => {
    const { owner, visitor, roomId } = await pair(158);
    await visitor.sock.deliver('room:message', { roomId, text: 'je file' });
    owner.sock.clearInbox();
    await visitor.sock.deliver('disconnect');
    assert.ok(owner.sock.received('room:system').some((m) => /Bob est sorti·e/.test(m.payload.text)));
  });

  test('fermeture d\'onglet d\'un muet : rien n\'est annoncé', async () => {
    const { owner, visitor } = await pair(160);
    await visitor.sock.deliver('disconnect');
    assert.equal(owner.sock.received('room:system').length, 0);
  });
});

// ===========================================================================
// SALONS — messages
// ===========================================================================
describe('room:message', () => {
  async function makeRoom(profile, roomOpts = {}) {
    const owner = await joinAs(profile, { forwardedFor: '203.0.113.70' });
    const create = await owner.sock.rpc('room:create', { name: 'Chat', type: 'public', ...roomOpts });
    return { owner, roomId: create.room.id, create };
  }

  test('texte en clair : diffusé avec un id de message généré par le serveur', async () => {
    const { owner, roomId } = await makeRoom(ALICE);
    await owner.sock.deliver('room:message', { roomId, text: 'bonjour' });
    const msg = owner.sock.last('room:message');
    assert.equal(msg.text, 'bonjour');
    assert.equal(msg.kind, 'text');
    assert.ok(msg.id, 'id serveur non forgeable');
    assert.equal(msg.fromId, owner.id);
  });

  test('non-membre ignoré', async () => {
    const { roomId } = await makeRoom(ALICE);
    const intrus = await joinAs(BOB, { forwardedFor: '203.0.113.71' });
    await intrus.sock.deliver('room:message', { roomId, text: 'coucou' });
    assert.equal(intrus.sock.count('room:message'), 0);
  });

  test('salon chiffré : relaie une enveloppe opaque (enc=1), ne scanne jamais', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.72' });
    const create = await owner.sock.rpc('room:create', {
      name: 'Groupe chiffré', encrypted: '1', verifier: 'V', salt: 'S',
    });
    const roomId = create.room.id;
    const env = { n: 'N', c: 'C' };
    await owner.sock.deliver('room:message', { roomId, env });
    const msg = owner.sock.last('room:message');
    assert.equal(msg.enc, '1');
    assert.deepEqual(msg.env, env);
    assert.equal('text' in msg, false, 'aucun clair côté serveur');
  });

  test('filtre de mots-clés : diffuse ET crée un signalement pour l\'opérateur', async () => {
    const { owner, roomId } = await makeRoom(ALICE);
    owner.sock.clearInbox();
    await owner.sock.deliver('room:message', { roomId, text: 'ceci est zzzinterdit' });
    // La diffusion a bien lieu (filtre NON bloquant).
    assert.ok(owner.sock.last('room:message'));
    // Un report:new est émis vers l'opérateur (source=filter).
    const report = io.adminEmits.find((e) => e.event === 'report:new');
    assert.ok(report, 'signalement filtre créé');
    assert.equal(report.payload.report.source, 'filter');
  });

  test('réponse en salon clair : seul l\'identifiant cité est relayé', async () => {
    const { owner, roomId } = await makeRoom(ALICE);
    await owner.sock.deliver('room:message', { roomId, text: 'ma réponse', replyTo: 'CITE1234' });
    const msg = owner.sock.last('room:message');
    assert.equal(msg.replyTo, 'CITE1234');
    assert.equal(msg.text, 'ma réponse');
  });

  test('réponse en salon clair : identifiant cité borné à 32 caractères', async () => {
    const { owner, roomId } = await makeRoom(ALICE);
    await owner.sock.deliver('room:message', { roomId, text: 'x', replyTo: 'z'.repeat(200) });
    assert.equal(owner.sock.last('room:message').replyTo.length, 32);
  });

  test('sans réponse : aucun champ replyTo dans la diffusion', async () => {
    const { owner, roomId } = await makeRoom(ALICE);
    await owner.sock.deliver('room:message', { roomId, text: 'simple' });
    assert.equal('replyTo' in owner.sock.last('room:message'), false);
  });

  test('média en salon clair : la réponse suit la pièce jointe', async () => {
    const { owner, roomId } = await makeRoom(ALICE);
    await owner.sock.deliver('room:message', {
      roomId, kind: 'media', mime: 'image/webp', media: 'image', data: Buffer.from([1, 2]), replyTo: 'CITE1234',
    });
    const msg = owner.sock.last('room:message');
    assert.equal(msg.kind, 'media');
    assert.equal(msg.replyTo, 'CITE1234');
  });

  test('salon chiffré : un replyTo en clair est ignoré (la réponse est scellée dans l\'enveloppe)', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.73' });
    const create = await owner.sock.rpc('room:create', {
      name: 'Groupe chiffré', encrypted: '1', verifier: 'V', salt: 'S',
    });
    await owner.sock.deliver('room:message', { roomId: create.room.id, env: { n: 'N', c: 'C' }, replyTo: 'FUITE' });
    const msg = owner.sock.last('room:message');
    assert.equal(msg.enc, '1');
    assert.equal('replyTo' in msg, false, 'le graphe des réponses reste invisible du serveur');
  });

  test('rate limit sur les messages de salon', async () => {
    const { owner, roomId } = await makeRoom(ALICE, {});
    for (let i = 0; i < config.rateLimit.maxEvents; i++) {
      await owner.sock.deliver('room:message', { roomId, text: `m${i}` });
    }
    owner.sock.clearInbox();
    await owner.sock.deliver('room:message', { roomId, text: 'de trop' });
    assert.ok(owner.sock.count('error:rate') > 0);
  });
});

// ===========================================================================
// SALONS — signalement d'un message public (DSA art.16)
// ===========================================================================
describe('room:report', () => {
  test('membre : crée un signalement et notifie l\'opérateur', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.80' });
    const create = await owner.sock.rpc('room:create', { name: 'Salon', type: 'public' });
    const roomId = create.room.id;
    const ack = await owner.sock.rpc('room:report', {
      roomId, messageId: 'm1', content: 'propos', authorId: owner.id, reason: 'illegal',
    });
    assert.equal(ack.ok, true);
    assert.ok(io.adminEmits.some((e) => e.event === 'report:new'));
  });

  test('non-membre : signalement refusé', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.81' });
    const create = await owner.sock.rpc('room:create', { name: 'Salon', type: 'public' });
    const intrus = await joinAs(BOB, { forwardedFor: '203.0.113.82' });
    const ack = await intrus.sock.rpc('room:report', {
      roomId: create.room.id, messageId: 'm', content: 'x',
    });
    assert.match(ack.error, /inaccessible/);
  });
});

// ===========================================================================
// SALONS — gouvernance (propriétaire)
// ===========================================================================
describe('gouvernance', () => {
  async function ownerRoomWithMember() {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.90' });
    const create = await owner.sock.rpc('room:create', { name: 'Gouv', type: 'public' });
    const roomId = create.room.id;
    const member = await joinAs(BOB, { forwardedFor: '203.0.113.91' });
    await member.sock.rpc('room:join', { roomId });
    return { owner, member, roomId };
  }

  test('room:kick : le propriétaire exclut un membre', async () => {
    const { owner, member, roomId } = await ownerRoomWithMember();
    const ack = await owner.sock.rpc('room:kick', { roomId, targetId: member.id });
    assert.equal(ack.ok, true);
    assert.ok(member.sock.received('room:kicked').some((m) => m.payload.roomId === roomId));
    assert.equal(await rooms.isMember(roomId, member.id), false);
  });

  test('room:kick : réservé au propriétaire', async () => {
    const { member, roomId, owner } = await ownerRoomWithMember();
    const ack = await member.sock.rpc('room:kick', { roomId, targetId: owner.id });
    assert.match(ack.error, /réservée au propriétaire/);
  });

  test('room:kick : impossible de s\'exclure soi-même', async () => {
    const { owner, roomId } = await ownerRoomWithMember();
    const ack = await owner.sock.rpc('room:kick', { roomId, targetId: owner.id });
    assert.match(ack.error, /vous exclure/);
  });

  test('room:close : le propriétaire ferme le salon (room:closed + suppression)', async () => {
    const { owner, member, roomId } = await ownerRoomWithMember();
    const ack = await owner.sock.rpc('room:close', { roomId });
    assert.equal(ack.ok, true);
    assert.ok(member.sock.received('room:closed').some((m) => m.payload.roomId === roomId));
    assert.equal(await rooms.getRoom(roomId), null);
  });

  test('room:close : réservé au propriétaire', async () => {
    const { member, roomId } = await ownerRoomWithMember();
    const ack = await member.sock.rpc('room:close', { roomId });
    assert.match(ack.error, /réservée au propriétaire/);
  });

  test('room:password : le propriétaire modifie le mot de passe d\'un salon privé', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.92' });
    const create = await owner.sock.rpc('room:create', { name: 'Privé', type: 'private', password: 'a' });
    const ack = await owner.sock.rpc('room:password', { roomId: create.room.id, password: 'b' });
    assert.equal(ack.ok, true);
    assert.equal(await rooms.verifyPassword(create.room.id, 'b'), true);
  });

  test('room:password : refusé sur un salon public', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.93' });
    const create = await owner.sock.rpc('room:create', { name: 'Public', type: 'public' });
    const ack = await owner.sock.rpc('room:password', { roomId: create.room.id, password: 'x' });
    assert.match(ack.error, /public/i);
  });

  test('room:password : refusé sur un salon chiffré (mot de passe figé)', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.94' });
    const create = await owner.sock.rpc('room:create', { name: 'Chiffré', encrypted: '1', verifier: 'V', salt: 'S' });
    const ack = await owner.sock.rpc('room:password', { roomId: create.room.id, password: 'x' });
    assert.match(ack.error, /figé/);
  });
});

// ===========================================================================
// DÉCONNEXION (RG-02) — destruction + cycle de vie du salon (RG-05/RG-06)
// ===========================================================================
describe('disconnect', () => {
  test('détruit la session et notifie les voisins', async () => {
    const a = await joinAs(ALICE, { forwardedFor: '203.0.113.100' });
    const b = await joinAs(BOB, { forwardedFor: '203.0.113.101' });
    b.sock.clearInbox();
    await a.sock.deliver('disconnect');
    assert.equal(await sessions.getSession(a.id), null, 'session détruite');
    assert.ok(b.sock.received('presence:remove').some((m) => m.payload.id === a.id));
  });

  test('salon vidé par le départ du dernier membre est supprimé (RG-05)', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.102' });
    const create = await owner.sock.rpc('room:create', { name: 'Éphémère', type: 'public' });
    await owner.sock.deliver('disconnect');
    assert.equal(await rooms.getRoom(create.room.id), null, 'salon vide supprimé');
  });

  test('départ du propriétaire : transfert au plus ancien présent (RG-06)', async () => {
    const owner = await joinAs(ALICE, { forwardedFor: '203.0.113.103' });
    const create = await owner.sock.rpc('room:create', { name: 'Transfert', type: 'public' });
    const roomId = create.room.id;
    const member = await joinAs(BOB, { forwardedFor: '203.0.113.104' });
    await member.sock.rpc('room:join', { roomId });

    await owner.sock.deliver('disconnect');
    assert.equal(await rooms.ownerOf(roomId), member.id, 'propriété transférée');
    assert.ok(member.sock.received('room:system').some((m) => /propriétaire/.test(m.payload.text)));
  });
});

// ===========================================================================
// SERVICE ONION TOR (design 2026-07-29)
// ===========================================================================
//
// Derrière l'onion, TOUS les visiteurs arrivent avec l'IP du `tor` local : sans
// traitement dédié ils partageraient un unique compteur d'anti-spam, et un seul
// bavard ferait taire tout le trafic Tor. Ces cas verrouillent la bascule.
describe('service onion', () => {
  const security = require('../server/security');

  test('identify : l\'accusé signale l\'accès onion (badge visible de soi seul)', async () => {
    const sock = connect({ onion: true, forwardedFor: '127.0.0.1' });
    const ack = await identify(sock);
    assert.equal(ack.ok, true);
    assert.equal(ack.onion, true);
    assert.equal(sock.data.onion, true);
  });

  test('identify : aucun marquage sur une connexion clearnet ordinaire', async () => {
    const sock = connect({ forwardedFor: '198.51.100.30' });
    const ack = await identify(sock);
    assert.equal(ack.onion, false);
    assert.equal(sock.data.onion, false);
  });

  /**
   * L'arbitrage du 2026-08-03 : l'accès onion est visible de SOI SEUL. Le publier
   * ferait des rares visiteurs Tor d'un salon une classe repérable, rattachant
   * tout ce qu'ils déclarent par ailleurs à un bit rare et discriminant.
   */
  test('le profil public NE contient PAS l\'accès onion', async () => {
    const onionUser = await joinAs(ALICE, { onion: true, forwardedFor: '127.0.0.1' });
    const profile = await sessions.getPublicProfile(onionUser.id);
    assert.equal('onion' in profile, false, 'toPublic ne doit jamais exposer l\'accès onion');

    // Et le voisin ne le voit pas davantage arriver dans sa liste de présents.
    const neighbour = await joinAs(BOB, { forwardedFor: '198.51.100.31' });
    const seen = neighbour.sock.received('presence:list').at(-1);
    for (const p of seen ? seen.payload : []) assert.equal('onion' in p, false);
  });

  test('deux connexions onion distinctes ne partagent PAS leur compteur', async () => {
    const max = config.rateLimit.maxEvents;
    const a = await joinAs(ALICE, { onion: true, forwardedFor: '127.0.0.1' });
    const b = await joinAs(BOB, { onion: true, forwardedFor: '127.0.0.1' });

    // A épuise son seau sur un handler limité (`room:peek`, qui l'est pour son
    // rôle d'anti-bruteforce sur les salons à mot de passe).
    for (let i = 0; i < max; i++) await a.sock.rpc('room:peek', { roomId: 'inexistant' });
    const refused = await a.sock.rpc('room:peek', { roomId: 'inexistant' });
    assert.match(refused.error || '', /Trop de requêtes/);

    // B, bien qu'arrivant de la même IP (127.0.0.1), n'est pas pénalisé — c'est
    // toute la raison d'être du seau par connexion.
    const okForB = await b.sock.rpc('room:peek', { roomId: 'inexistant' });
    assert.match(okForB.error || '', /introuvable/, 'un bavard ne doit pas faire taire les autres visiteurs Tor');
  });

  test('le seau global finit par borner l\'abus, quel que soit le nombre de connexions', async () => {
    const before = config.onion.globalRlMax;
    config.onion.globalRlMax = 3;
    try {
      for (let i = 0; i < 3; i++) assert.equal(await security.isOnionRateLimited(`sock${i}`), false);
      assert.equal(await security.isOnionRateLimited('sockN'), true, 'plafond global atteint');
    } finally {
      config.onion.globalRlMax = before;
    }
  });

  /**
   * Symptôme du bloc onion absent du Caddyfile : le trafic Tor retombe sur le
   * compteur commun de 127.0.0.1 sans que rien ne le signale. La sonde le compte
   * pour la console opérateur (cf. metrics.js).
   */
  test('connexion loopback sans marqueur : comptée quand un onion est annoncé', async () => {
    const beforeHost = config.onion.host;
    config.onion.host = 'proximaexample.onion';
    try {
      await joinAs(ALICE, { forwardedFor: '127.0.0.1' });
      const counters = await security.onionCounters();
      assert.ok(counters.unmarkedLoopback >= 1, 'la sonde doit signaler le bloc Caddy manquant');
    } finally {
      config.onion.host = beforeHost;
    }
  });
});
