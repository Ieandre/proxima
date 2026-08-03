'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { fake } = require('./helpers/inject-redis');
const rooms = require('../server/domain/rooms');
const roomActions = require('../server/room-actions');
const sessions = require('../server/domain/sessions');

beforeEach(() => fake.__reset());

// `io` factice : capte les emit sans réseau — suffit pour broadcastMembers/pushLobby.
const stubIo = () => ({ to: () => ({ emit() {} }) });

// Une session réelle évite que le membre soit nettoyé comme « fantôme » (memberProfiles).
const makeSession = (id, pseudo) =>
  sessions.createSession(id, {
    pseudo,
    age: 25,
    city: 'Paris',
    region: '11',
    country: 'FR',
    countryLabel: 'France',
    lon: 2.3488,
    lat: 48.85341,
    pub: 'PUB_' + id,
  });

test('handleLeave : un salon éphémère vidé est supprimé (RG-05)', async () => {
  const { id } = await rooms.createRoom({ name: 'S', type: 'public', ownerId: 'owner' });
  await roomActions.handleLeave(stubIo(), id, 'owner');
  assert.equal(await rooms.getRoom(id), null, 'le salon éphémère vide doit être supprimé');
});

test('handleLeave : un salon éphémère transfère la propriété au plus ancien (RG-06)', async () => {
  await makeSession('m2', 'Bob'); // m2 reste présent (pas nettoyé comme fantôme)
  const { id } = await rooms.createRoom({ name: 'S', type: 'public', ownerId: 'owner' });
  await rooms.addMember(id, 'm2');
  await roomActions.handleLeave(stubIo(), id, 'owner');
  assert.equal(await rooms.ownerOf(id), 'm2', 'le plus ancien membre restant devient propriétaire');
});

test('handleLeave : un salon permanent vidé survit, owner inchangé (exception RG-05/RG-06)', async () => {
  await rooms.createPersistentRoom({ slug: 'general', name: 'Général' });
  await rooms.addMember('general', 'u1');
  await roomActions.handleLeave(stubIo(), 'general', 'u1');

  const room = await rooms.getRoom('general');
  assert.notEqual(room, null, 'le salon permanent ne doit pas être supprimé');
  assert.equal(room.owner, 'system', 'pas de transfert de propriété sur un permanent');
  assert.equal(await rooms.memberCount('general'), 0);
});
