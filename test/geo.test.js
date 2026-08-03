'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { fake } = require('./helpers/inject-redis');
const geo = require('../server/domain/geo');

beforeEach(() => fake.__reset());

// Coordonnées (lon, lat).
const PARIS = [2.3488, 48.85341];
const PARIS_PROCHE = [2.3488, 48.95]; // ~11 km au nord de Paris
const LYON = [4.8357, 45.764]; // ~390 km de Paris

test('nearbyIds : renvoie les voisins dans le rayon, soi-même exclu', async () => {
  await geo.addPresence('paris', ...PARIS);
  await geo.addPresence('proche', ...PARIS_PROCHE);
  await geo.addPresence('lyon', ...LYON);

  const voisins = await geo.nearbyIds('paris', 75);
  assert.deepEqual(voisins.sort(), ['proche']);
  assert.equal(voisins.includes('paris'), false, 'soi-même doit être exclu');
  assert.equal(voisins.includes('lyon'), false, 'hors rayon doit être exclu');
});

test('nearbyIds : respecte le rayon demandé', async () => {
  await geo.addPresence('paris', ...PARIS);
  await geo.addPresence('proche', ...PARIS_PROCHE);
  // Rayon serré : le voisin à ~11 km sort du périmètre.
  assert.deepEqual(await geo.nearbyIds('paris', 5), []);
});

test('nearbyIds : [] si la session de référence n\'est plus indexée', async () => {
  // FROMMEMBER sur un membre absent : Redis lève, geo doit renvoyer [].
  assert.deepEqual(await geo.nearbyIds('inexistant', 75), []);
});

test('removePresence : la session disparaît du voisinage', async () => {
  await geo.addPresence('paris', ...PARIS);
  await geo.addPresence('proche', ...PARIS_PROCHE);
  assert.deepEqual(await geo.nearbyIds('paris', 75), ['proche']);

  await geo.removePresence('proche');
  assert.deepEqual(await geo.nearbyIds('paris', 75), []);
});
