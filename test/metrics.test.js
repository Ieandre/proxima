'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Fake-Redis injecté AVANT tout module serveur (comme les autres suites).
const { fake } = require('./helpers/inject-redis');
const geo = require('../server/domain/geo');
const rooms = require('../server/domain/rooms');
const moderation = require('../server/domain/moderation');
const security = require('../server/security');
const metrics = require('../server/metrics');

beforeEach(() => {
  fake.__reset();
  security.unfreezeSalt(); // état de sel déterministe entre les tests
});

test('snapshot : compte les sessions présentes (index GEO)', async () => {
  await geo.addPresence('s1', 2.35, 48.85);
  await geo.addPresence('s2', 2.34, 48.86);
  const snap = await metrics.snapshot();
  assert.equal(snap.sessions, 2);
});

test('snapshot : agrège les salons publics (total, membres, régime mot de passe, permanents)', async () => {
  await rooms.createRoom({ name: 'Public A', type: 'public', ownerId: 'o1' }); // 1 membre (owner)
  await rooms.createRoom({
    name: 'Chiffré B', type: 'public', ownerId: 'o2', encrypted: true, verifier: 'v', salt: 'sel',
  }); // chiffré + 1 membre
  await rooms.createPersistentRoom({ slug: 'accueil', name: 'Accueil' }); // permanent, 0 membre

  const snap = await metrics.snapshot();
  assert.equal(snap.rooms.total, 3);
  assert.equal(snap.rooms.members, 2); // 1 + 1 + 0
  // Tous les salons sont chiffrés : seul le régime à mot de passe se compte encore.
  assert.equal(snap.rooms.password, 1);
  assert.equal(snap.rooms.permanent, 1);
});

test('snapshot : agrège les signalements (total, prioritaires, par motif)', async () => {
  await moderation.createReport({ scope: 'room', messageId: 'm1', reporterId: 'r1', reason: 'minor' });
  await moderation.createReport({ scope: 'room', messageId: 'm2', reporterId: 'r2', reason: 'illegal' });
  await moderation.createReport({ scope: 'room', messageId: 'm3', reporterId: 'r3', reason: 'harassment' });

  const snap = await metrics.snapshot();
  assert.equal(snap.reports.total, 3);
  assert.equal(snap.reports.priority, 2); // minor + illegal
  assert.equal(snap.reports.byReason.minor, 1);
  assert.equal(snap.reports.byReason.harassment, 1);
});

test('snapshot : reflète l’état du sel IP et la santé Redis', async () => {
  let snap = await metrics.snapshot();
  assert.equal(snap.saltFrozen, false);
  assert.equal(snap.redisOk, true);
  assert.equal(typeof snap.uptimeSec, 'number');

  security.freezeSalt();
  snap = await metrics.snapshot();
  assert.equal(snap.saltFrozen, true);
  security.unfreezeSalt();
});

test('snapshot : AUCUNE PII (ni pseudo, ni IP, ni identifiant) — zéro donnée nominative', async () => {
  await geo.addPresence('session-secrete', 2.35, 48.85);
  await rooms.createRoom({ name: 'Salon', type: 'public', ownerId: 'owner-secret' });
  await moderation.createReport({
    scope: 'room', messageId: 'm1', reporterId: 'r1', reason: 'harassment',
    authorPseudo: 'Mallory', reporterPseudo: 'Alice', content: 'texte litigieux',
  });

  const dump = JSON.stringify(await metrics.snapshot());
  for (const leak of ['session-secrete', 'owner-secret', 'Mallory', 'Alice', 'texte litigieux', 'ip']) {
    assert.equal(dump.includes(leak), false, `fuite potentielle : « ${leak} »`);
  }
});
