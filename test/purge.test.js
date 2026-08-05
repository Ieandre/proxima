'use strict';

// Un onion annoncé : c'est la condition pour que la sonde de marquage écrive son
// compteur, dont on vérifie ensuite qu'une remise à zéro ne l'emporte pas.
process.env.ONION_HOST = 'exemple.onion';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { fake } = require('./helpers/inject-redis');
const { scanKeys } = require('../server/infra/scan');
const geo = require('../server/domain/geo');
const invites = require('../server/domain/invites');
const moderation = require('../server/domain/moderation');
const purge = require('../server/domain/purge');
const rooms = require('../server/domain/rooms');
const sessions = require('../server/domain/sessions');
const security = require('../server/security');

beforeEach(() => fake.__reset());

/** Un état de plateforme complet : deux sessions présentes, deux salons, une invitation. */
async function populate() {
  for (const [id, pseudo] of [['s1', 'Alice'], ['s2', 'Bob']]) {
    await sessions.createSession(id, {
      pseudo,
      age: 30,
      gender: 'A',
      city: 'Paris',
      region: '11',
      country: 'FR',
      countryLabel: 'France',
      lon: 2.3488,
      lat: 48.85341,
      pub: `PUB_${id}`,
    });
    await geo.addPresence(id, 2.3488, 48.85341);
  }
  const { id: roomId } = await rooms.createRoom({ name: 'Kiosque', type: 'public', password: '', ownerId: 's1' });
  await rooms.createPersistentRoom({ slug: 'general', name: 'Général' });
  const token = await invites.create('s1');
  return { roomId, token };
}

test('purgeChatState : efface sessions, présence, salons et invitations, et les dénombre', async () => {
  const { roomId, token } = await populate();

  const counts = await purge.purgeChatState();

  assert.deepEqual(counts, { presence: 2, sessions: 2, rooms: 2, invites: 1 });
  assert.equal(await sessions.getSession('s1'), null);
  assert.equal(await geo.presenceCount(), 0);
  assert.equal(await rooms.getRoom(roomId), null);
  assert.equal(await rooms.getRoom('general'), null, 'un permanent part aussi (sa relève est à l’appelant)');
  assert.equal(await rooms.memberCount(roomId), 0);
  assert.equal(await invites.get(token), null);
  assert.deepEqual(await rooms.listAll(), []);
});

test('purgeChatState : ne touche ni la modération, ni l’anti-spam, ni les compteurs onion', async () => {
  await populate();
  const report = await moderation.createReport({
    scope: 'room',
    messageId: 'msg-1',
    content: 'contenu signalé',
    authorId: 's2',
    reason: 'illegal',
  });
  await moderation.banSession('s2');
  const incident = await moderation.openIncident('réquisition 2026-42');
  await security.isRateLimited('203.0.113.9'); // seau d'anti-spam
  await security.noteUnmarkedLoopback('127.0.0.1'); // compteur onion

  await purge.purgeChatState();

  // Art. 16 : un signalement reçu est une notification à traiter, pas un état d'exploitation.
  assert.ok(await moderation.getReport(report.id));
  assert.equal((await moderation.listReports()).length, 1);
  assert.equal(await moderation.isBanned('s2'), true);
  // Préservation prospective : l'incident survit à tout geste d'exploitation.
  assert.ok(await moderation.getIncident(incident.id));
  // Les seaux d'anti-spam survivent : les vider ouvrirait une fenêtre de flood juste après.
  assert.equal((await scanKeys('rl:*')).length, 1);
  assert.equal((await security.onionCounters()).unmarkedLoopback, 1);
});

test('purgeChatState : idempotent sur une plateforme déjà vide', async () => {
  assert.deepEqual(await purge.purgeChatState(), { presence: 0, sessions: 0, rooms: 0, invites: 0 });
});
