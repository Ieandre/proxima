'use strict';

/**
 * Parcours de bout en bout SUR UN VRAI TRANSPORT Socket.IO (WebSocket) :
 * deux clients réels dialoguent avec le serveur réel (fake-Redis injecté).
 * Contrairement au harness en mémoire (test/socket.test.js), ceci exerce la
 * sérialisation, les accusés, les rooms et les diffusions authentiques de
 * Socket.IO — c'est le filet de sécurité « boîte noire » du câblage temps réel.
 *
 * Lancement : `npm run test:e2e` (nécessite `npm install` — dépendances réseau).
 */

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');

const { startServer, stopServer, fake } = require('./helpers/e2e-server');
const { connect, ready, rpc, rpcCb, once, identify } = require('./helpers/client');

let server;
let url;
const open = new Set(); // clients à fermer après chaque test

before(async () => {
  server = await startServer();
  url = server.url;
});

after(async () => {
  await stopServer(server);
});

beforeEach(() => {
  for (const c of open) c.disconnect();
  open.clear();
  fake.__reset();
});

/** Ouvre + attend la connexion d'un client, enregistré pour le nettoyage. */
async function client() {
  const c = connect(url);
  open.add(c);
  await ready(c);
  return c;
}

describe('E2E — identification & présence', () => {
  test('deux clients voisins se découvrent en temps réel', async () => {
    const a = await client();
    const ackA = await identify(a, { pseudo: 'Alice' });
    assert.equal(ackA.ok, true);
    assert.ok(ackA.me.id);

    const b = await client();
    // A doit être notifié de l'arrivée de B (présence de proximité).
    const addOnA = once(a, 'presence:add');
    const ackB = await identify(b, { pseudo: 'Bob', pub: 'PUB_BOB' });
    assert.equal(ackB.ok, true);

    const added = await addOnA;
    assert.equal(added.id, ackB.me.id);
    assert.equal(added.pseudo, 'Bob');
  });

  test('identification invalide (mineur) rejetée', async () => {
    const a = await client();
    const ack = await identify(a, { age: 16 });
    assert.match(ack.error, /18 ans/);
  });
});

describe('E2E — messages privés chiffrés (serveur aveugle)', () => {
  test('l\'enveloppe opaque transite intacte de A vers B', async () => {
    const a = await client();
    const ackA = await identify(a, { pseudo: 'Alice' });
    const b = await client();
    const ackB = await identify(b, { pseudo: 'Bob', pub: 'PUB_BOB' });

    const env = { n: 'NONCE_B64', c: 'CIPHER_B64', pub: 'PUB_ALICE' };
    const recvOnB = once(b, 'pm:recv');
    a.emit('pm:send', { toId: ackB.me.id, env, ts: 1234 });

    const recv = await recvOnB;
    assert.equal(recv.fromId, ackA.me.id);
    assert.equal(recv.fromPseudo, 'Alice');
    assert.deepEqual(recv.env, env, 'enveloppe transmise sans altération');
  });

  test('destinataire absent -> pm:undeliverable renvoyé à l\'émetteur', async () => {
    const a = await client();
    await identify(a, { pseudo: 'Alice' });
    const undeliverable = once(a, 'pm:undeliverable');
    a.emit('pm:send', { toId: 'fantome', env: { n: 'N', c: 'C', pub: 'P' } });
    const evt = await undeliverable;
    assert.equal(evt.toId, 'fantome');
  });
});

describe('E2E — salons publics', () => {
  test('création, jonction, message et diffusion à tous les membres', async () => {
    const owner = await client();
    const ackOwner = await identify(owner, { pseudo: 'Alice' });
    const create = await rpc(owner, 'room:create', { name: 'Salon E2E', type: 'public' });
    assert.equal(create.ok, true);
    const roomId = create.room.id;

    // Le salon apparaît dans le listing public.
    const list = await rpcCb(owner, 'room:list');
    assert.ok(list.rooms.some((r) => r.id === roomId));

    const member = await client();
    await identify(member, { pseudo: 'Bob', pub: 'PUB_BOB' });

    // Le propriétaire reçoit le message système d'arrivée.
    const sysOnOwner = once(owner, 'room:system');
    const joinAck = await rpc(member, 'room:join', { roomId });
    assert.equal(joinAck.ok, true);
    assert.equal(joinAck.owner, ackOwner.me.id);
    const sys = await sysOnOwner;
    assert.match(sys.text, /est entré·e/);

    // Un message du membre est diffusé au propriétaire, avec un id serveur.
    const msgOnOwner = once(owner, 'room:message');
    member.emit('room:message', { roomId, text: 'bonjour à tous' });
    const msg = await msgOnOwner;
    assert.equal(msg.text, 'bonjour à tous');
    assert.equal(msg.kind, 'text');
    assert.ok(msg.id, 'id de message généré côté serveur');
  });

  test('gouvernance : le propriétaire exclut un membre (room:kicked reçu)', async () => {
    const owner = await client();
    await identify(owner, { pseudo: 'Alice' });
    const create = await rpc(owner, 'room:create', { name: 'Gouv E2E', type: 'public' });
    const roomId = create.room.id;

    const member = await client();
    const ackMember = await identify(member, { pseudo: 'Bob', pub: 'PUB_BOB' });
    await rpc(member, 'room:join', { roomId });

    const kickedOnMember = once(member, 'room:kicked');
    const kickAck = await rpc(owner, 'room:kick', { roomId, targetId: ackMember.me.id });
    assert.equal(kickAck.ok, true);
    const kicked = await kickedOnMember;
    assert.equal(kicked.roomId, roomId);
  });

  test('fermeture du salon : tous les membres reçoivent room:closed', async () => {
    const owner = await client();
    await identify(owner, { pseudo: 'Alice' });
    const create = await rpc(owner, 'room:create', { name: 'À fermer', type: 'public' });
    const roomId = create.room.id;
    const member = await client();
    await identify(member, { pseudo: 'Bob', pub: 'PUB_BOB' });
    await rpc(member, 'room:join', { roomId });

    const closedOnMember = once(member, 'room:closed');
    const ack = await rpc(owner, 'room:close', { roomId });
    assert.equal(ack.ok, true);
    const closed = await closedOnMember;
    assert.equal(closed.roomId, roomId);
  });
});

describe('E2E — salon chiffré (relais opaque de bout en bout)', () => {
  test('join par verifier + relais d\'enveloppe chiffrée entre membres', async () => {
    const owner = await client();
    await identify(owner, { pseudo: 'Alice' });
    const create = await rpc(owner, 'room:create', {
      name: 'Groupe chiffré', encrypted: '1', verifier: 'PREUVE', salt: 'SELPUBLIC',
    });
    assert.equal(create.room.encrypted, true);
    assert.equal(create.invite, undefined);
    const roomId = create.room.id;

    const member = await client();
    await identify(member, { pseudo: 'Bob', pub: 'PUB_BOB' });

    // Mauvais verifier rejeté.
    const bad = await rpc(member, 'room:join', { roomId, verifier: 'FAUX' });
    assert.match(bad.error, /incorrect/);

    // Bon verifier accepté.
    const ok = await rpc(member, 'room:join', { roomId, verifier: 'PREUVE' });
    assert.equal(ok.ok, true);

    // Message chiffré relayé opaque (enc=1, aucun clair côté serveur).
    const env = { n: 'N', c: 'C' };
    const msgOnMember = once(member, 'room:message');
    owner.emit('room:message', { roomId, env });
    const msg = await msgOnMember;
    assert.equal(msg.enc, '1');
    assert.deepEqual(msg.env, env);
    assert.equal('text' in msg, false);
  });
});

describe('E2E — déconnexion', () => {
  test('la fermeture d\'un client notifie ses voisins (presence:remove)', async () => {
    const a = await client();
    const ackA = await identify(a, { pseudo: 'Alice' });
    const b = await client();
    await identify(b, { pseudo: 'Bob', pub: 'PUB_BOB' });

    const removeOnB = once(b, 'presence:remove', 3000);
    a.disconnect();
    const removed = await removeOnB;
    assert.equal(removed.id, ackA.me.id);
  });
});
