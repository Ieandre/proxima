'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Mots-clés du filtre : DOIVENT être définis avant le require de `moderation`
// (qui charge `config`, lequel lit l'environnement au chargement).
process.env.MOD_KEYWORDS = 'interdit, arnaque';

const { fake } = require('./helpers/inject-redis');
const moderation = require('../server/domain/moderation');

beforeEach(() => fake.__reset());

const sampleReport = (over = {}) => ({
  scope: 'room',
  roomId: 'r1',
  messageId: 'm1',
  content: 'message litigieux',
  authorId: 'auteur-1',
  authorPseudo: 'Mallory',
  reporterId: 'signaleur-1',
  reporterPseudo: 'Alice',
  reason: 'harassment',
  source: 'reporter',
  ...over,
});

test('createReport + getReport : aller-retour, et AUCUNE IP dans le signalement (RG-08)', async () => {
  const created = await moderation.createReport(sampleReport({ ts: 1000 }));
  assert.ok(created);

  const r = await moderation.getReport(created.id);
  assert.ok(r);
  assert.equal(r.scope, 'room');
  assert.equal(r.roomId, 'r1');
  assert.equal(r.messageId, 'm1');
  assert.equal(r.content, 'message litigieux');
  assert.equal(r.authorPseudo, 'Mallory');
  assert.equal(r.reporterPseudo, 'Alice');
  assert.equal(r.reason, 'harassment');
  assert.equal(r.source, 'reporter');
  assert.equal(r.unverified, true);
  assert.equal(r.ts, 1000);
  assert.equal(typeof r.ts, 'number');

  // Cas critique : jamais d'IP — ni dans l'objet renvoyé, ni dans le hash Redis brut.
  assert.equal('ip' in r, false);
  const raw = await fake.hGetAll('mod:report:' + created.id);
  assert.equal('ip' in raw, false);
});

test('getReport : signalement autosuffisant, consultable sans aucune session (RG-02)', async () => {
  const created = await moderation.createReport(sampleReport({ authorId: 'parti', authorPseudo: 'Bob' }));
  // Aucune session 'sess:parti' n'existe : le report doit rester complet par lui-même.
  assert.equal(await fake.hGet('sess:parti', 'pseudo'), null);

  const r = await moderation.getReport(created.id);
  assert.equal(r.authorPseudo, 'Bob');
  assert.equal(r.content, 'message litigieux');
});

test('createReport : un signalement issu du filtre est fiable (unverified = false)', async () => {
  const created = await moderation.createReport(sampleReport({ source: 'filter', reporterId: null }));
  assert.ok(created);
  assert.equal(created.unverified, false);
});

test('getReport : null si le signalement n\'existe pas', async () => {
  assert.equal(await moderation.getReport('inconnu'), null);
});

test('listReports : les plus récents d\'abord', async () => {
  await moderation.createReport(sampleReport({ messageId: 'a', reporterId: 'rA', ts: 1000 }));
  await moderation.createReport(sampleReport({ messageId: 'b', reporterId: 'rB', ts: 3000 }));
  await moderation.createReport(sampleReport({ messageId: 'c', reporterId: 'rC', ts: 2000 }));

  const list = await moderation.listReports();
  assert.deepEqual(list.map((r) => r.ts), [3000, 2000, 1000]);
});

test('listReports : respecte la limite', async () => {
  for (let i = 0; i < 5; i++) {
    await moderation.createReport(sampleReport({ messageId: 'm' + i, reporterId: 'r' + i, ts: 1000 + i }));
  }
  const list = await moderation.listReports(2);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((r) => r.ts), [1004, 1003]);
});

test('createReport : déduplication — un signaleur = un report par message', async () => {
  const first = await moderation.createReport(sampleReport({ messageId: 'm9', reporterId: 'sig-x' }));
  const dup = await moderation.createReport(sampleReport({ messageId: 'm9', reporterId: 'sig-x' }));
  assert.ok(first);
  assert.equal(dup, null); // doublon ignoré

  // Un AUTRE signaleur sur le même message crée bien un second signalement.
  const other = await moderation.createReport(sampleReport({ messageId: 'm9', reporterId: 'sig-y' }));
  assert.ok(other);

  const list = await moderation.listReports();
  assert.equal(list.length, 2);
});

test('deleteReport : purge le hash et l\'index', async () => {
  const created = await moderation.createReport(sampleReport({ ts: 1000 }));
  await moderation.deleteReport(created.id);
  assert.equal(await moderation.getReport(created.id), null);
  assert.deepEqual(await moderation.listReports(), []);
});

test('listReports : nettoyage paresseux d\'une entrée d\'index dont le hash a expiré', async () => {
  const created = await moderation.createReport(sampleReport({ ts: 1000 }));
  // Simule l'expiration TTL du hash sans toucher à l'index zset.
  await fake.del('mod:report:' + created.id);

  const list = await moderation.listReports();
  assert.deepEqual(list, []);
  // L'entrée fantôme a été retirée de l'index au passage.
  assert.deepEqual(await fake.zRange('mod:reports', 0, -1), []);
});

test('scanText : détecte un terme interdit, insensible à la casse et aux accents', () => {
  const hit = moderation.scanText('Ceci est INTERDÎT ici');
  assert.equal(hit.flagged, true);
  assert.deepEqual(hit.terms, ['interdit']);

  assert.equal(moderation.scanText('une ÂRNAQUE évidente').flagged, true);
});

test('scanText : ne marque pas un texte normal et ne lève jamais', () => {
  const ok = moderation.scanText('bonjour tout le monde');
  assert.equal(ok.flagged, false);
  assert.deepEqual(ok.terms, []);

  assert.doesNotThrow(() => moderation.scanText(null));
  assert.equal(moderation.scanText(undefined).flagged, false);
});

test('banSession / isBanned / unbanSession : exclusion volatile best-effort', async () => {
  assert.equal(await moderation.isBanned('s1'), false);
  await moderation.banSession('s1');
  assert.equal(await moderation.isBanned('s1'), true);
  assert.equal(await moderation.isBanned('s2'), false);
  await moderation.unbanSession('s1');
  assert.equal(await moderation.isBanned('s1'), false);
});

test('openIncident / getIncident / closeIncident : réquisition prospective', async () => {
  const { id } = await moderation.openIncident('réquisition n°42');
  const inc = await moderation.getIncident(id);
  assert.ok(inc);
  assert.equal(inc.reason, 'réquisition n°42');
  assert.equal(inc.saltFrozen, true);
  assert.equal(typeof inc.openedAt, 'number');

  await moderation.closeIncident(id);
  assert.equal(await moderation.getIncident(id), null);
});
