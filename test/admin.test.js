'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Le secret opérateur doit être défini avant le require de `admin` (qui charge `config`).
const SECRET = 'jeton-operateur-test';
process.env.OPERATOR_SECRET = SECRET;

// `admin` charge des modules dépendant de Redis (moderation/rooms/...) : on injecte le fake d'abord.
const { fake } = require('./helpers/inject-redis');
const { createHarness } = require('./helpers/socket-harness');
const admin = require('../server/admin');
const { registerHandlers } = require('../server/handlers');
const geo = require('../server/domain/geo');
const invites = require('../server/domain/invites');
const moderation = require('../server/domain/moderation');
const rooms = require('../server/domain/rooms');
const sessions = require('../server/domain/sessions');
const security = require('../server/security');

test('tokensMatch : vrai uniquement si les jetons coïncident', () => {
  assert.equal(admin.tokensMatch('abc', 'abc'), true);
  assert.equal(admin.tokensMatch('abc', 'abd'), false);
  assert.equal(admin.tokensMatch('abc', ''), false); // secret non configuré -> toujours faux
  assert.equal(admin.tokensMatch('', ''), false);
  assert.equal(admin.tokensMatch(undefined, 'abc'), false);
  assert.equal(admin.tokensMatch('court', 'beaucoup-plus-long'), false); // longueurs différentes, pas de throw
});

test('authMiddleware : refuse sans jeton, refuse un mauvais jeton, accepte le bon', () => {
  const run = (auth) => {
    let received = 'NON_APPELE';
    admin.authMiddleware({ handshake: { auth } }, (err) => {
      received = err;
    });
    return received;
  };

  assert.ok(run({}) instanceof Error, 'pas de jeton -> Error');
  assert.ok(run({ token: 'mauvais' }) instanceof Error, 'mauvais jeton -> Error');
  assert.equal(run({ token: SECRET }), undefined, 'bon jeton -> next() sans erreur');
});

// ===========================================================================
// Console opérateur pilotée de bout en bout : les deux namespaces sont montés,
// le public pour disposer de VRAIES sessions et de vrais salons, `/admin` pour
// agir dessus.
// ===========================================================================
const ALICE = { pseudo: 'Alice', age: 30, gender: 'F', city: 'Paris', pub: 'PUB_ALICE' };

let io;
let connect;
let op; // socket opérateur connecté sur /admin

beforeEach(async () => {
  fake.__reset();
  // Le gel du sel vit en mémoire de processus : sans ce dégel, le test qui gèle
  // contaminerait tous les suivants.
  security.unfreezeSalt();
  const h = createHarness();
  io = h.io;
  connect = h.connect;
  registerHandlers(io);
  admin.registerAdminNamespace(io);
  op = await io.of('/admin').connect({ auth: { token: SECRET } });
});

/** Socket public identifié ; renvoie { sock, id }. */
async function joinAs(overrides = {}) {
  const sock = connect();
  await sock.rpc('identify', { ...ALICE, ...overrides });
  return { sock, id: sock.data.sessionId };
}

describe('connexion à /admin', () => {
  test('un jeton invalide fait échouer la connexion', async () => {
    await assert.rejects(() => io.of('/admin').connect({ auth: { token: 'mauvais' } }), /unauthorized/);
  });

  test('à l’ouverture, l’opérateur reçoit signalements, métriques et salons', async () => {
    assert.ok(op.last('admin:snapshot'), 'signalements');
    assert.ok(op.last('admin:metrics'), 'métriques');
    assert.ok(Array.isArray(op.last('admin:rooms').rooms), 'salons');
  });
});

// ===========================================================================
// SALONS — voir, déplier, fermer
// ===========================================================================
describe('salons', () => {
  test('la console voit ce que l’annuaire public tait (privé sur invitation, région)', async () => {
    const { sock } = await joinAs();
    const pub = await sock.rpc('room:create', { name: 'Le kiosque', type: 'public' });
    const priv = await sock.rpc('room:create', { name: 'Entre nous', type: 'private', password: 'porte' });

    // L'annuaire public, lui, ne référence même pas le privé sur invitation.
    const listed = (await rooms.listPublic()).map((r) => r.id);
    assert.ok(listed.includes(pub.room.id));
    assert.ok(!listed.includes(priv.room.id), 'un privé sur invitation reste hors annuaire');

    const res = await op.rpc('admin:rooms:refresh', {});
    const byId = new Map(res.rooms.map((r) => [r.id, r]));
    assert.ok(byId.has(pub.room.id));

    const hidden = byId.get(priv.room.id);
    assert.ok(hidden, 'la console voit le privé sur invitation');
    assert.equal(hidden.type, 'private');
    assert.equal(hidden.hasPassword, true, 'la porte est signalée…');
    assert.equal(hidden.keyMode, 'group', '…et reste distincte du régime de clé');

    assert.ok([...byId.values()].some((r) => r.region && r.persistent), 'le salon de région est visible');
  });

  test('la liste dit combien, le dépliage dit qui', async () => {
    const { sock, id } = await joinAs();
    const { room } = await sock.rpc('room:create', { name: 'Le kiosque', type: 'public' });

    const res = await op.rpc('admin:rooms:refresh', {});
    const row = res.rooms.find((r) => r.id === room.id);
    assert.equal(row.count, 1);
    assert.ok(!JSON.stringify(res.rooms).includes('Alice'), 'aucun pseudo dans la liste');

    const detail = await op.rpc('admin:room:members', { roomId: room.id });
    assert.equal(detail.ok, true);
    assert.equal(detail.owner, id);
    assert.deepEqual(detail.members, [{ id, pseudo: 'Alice' }]);
  });

  test('admin:room:members refuse un salon inconnu', async () => {
    assert.match((await op.rpc('admin:room:members', { roomId: 'fantome' })).error, /introuvable/);
  });

  test('admin:close ferme, prévient les membres et rafraîchit la console', async () => {
    const { sock } = await joinAs();
    const { room } = await sock.rpc('room:create', { name: 'Le kiosque', type: 'public' });
    sock.clearInbox();
    op.clearInbox();

    assert.equal((await op.rpc('admin:close', { roomId: room.id })).ok, true);

    assert.deepEqual(sock.last('room:closed'), { roomId: room.id });
    assert.equal(await rooms.getRoom(room.id), null);
    assert.ok(!io.hub.members(`room:${room.id}`).has(sock), 'les membres sont sortis de la room');
    // La liste à jour arrive sans qu'on la redemande.
    assert.ok(!op.last('admin:rooms').rooms.some((r) => r.id === room.id));
  });
});

// ===========================================================================
// REMISE À ZÉRO
// ===========================================================================
describe('admin:reset', () => {
  test('refuse sans la phrase de confirmation', async () => {
    const { id } = await joinAs();
    const res = await op.rpc('admin:reset', { confirm: 'oui' });
    assert.match(res.error, new RegExp(admin.RESET_PHRASE));
    assert.ok(await sessions.getSession(id), 'la session est intacte');
  });

  test('refuse tant que le sel IP est gelé (préservation prospective)', async () => {
    const { id } = await joinAs();
    security.freezeSalt();
    const res = await op.rpc('admin:reset', { confirm: admin.RESET_PHRASE });
    assert.match(res.error, /Préservation en cours/);
    assert.ok(await sessions.getSession(id), 'rien n’a été effacé');
  });

  test('efface sessions, présence, salons et invitations — et conserve la modération', async () => {
    const { sock, id } = await joinAs();
    const { room } = await sock.rpc('room:create', { name: 'Le kiosque', type: 'public' });
    const token = await invites.create(id);
    const report = await moderation.createReport({
      scope: 'room',
      roomId: room.id,
      messageId: 'msg-1',
      content: 'contenu signalé',
      authorId: id,
      reason: 'spam',
    });
    await moderation.banSession('session-bannie');

    const res = await op.rpc('admin:reset', { confirm: admin.RESET_PHRASE });

    assert.equal(res.ok, true);
    assert.equal(res.sessions, 1);
    assert.equal(res.invites, 1);
    assert.equal(res.presence, 1);
    assert.ok(res.rooms >= 1);

    assert.equal(await sessions.getSession(id), null);
    assert.equal(await rooms.getRoom(room.id), null);
    assert.equal(await geo.presenceCount(), 0);
    assert.equal(await invites.get(token), null);

    // Ce que la remise à zéro ne touche JAMAIS.
    assert.ok(await moderation.getReport(report.id), 'un signalement reçu survit (art. 16)');
    assert.equal(await moderation.isBanned('session-bannie'), true);
  });

  test('relève les salons permanents et coupe le public, jamais l’opérateur', async () => {
    const { sock } = await joinAs();

    const res = await op.rpc('admin:reset', { confirm: admin.RESET_PHRASE });

    assert.equal(res.permanentRooms, 3, 'les salons du seed sont recréés');
    assert.ok(await rooms.getRoom('general'), 'un permanent est de retour');
    assert.equal(sock.disconnected, true, 'le client public est coupé (sinon : fantôme)');
    assert.equal(op.disconnected, false, 'l’opérateur reste connecté');
  });
});
