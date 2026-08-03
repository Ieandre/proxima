'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { fake } = require('./helpers/inject-redis');
const sessions = require('../server/domain/sessions');
const geo = require('../server/domain/geo');

beforeEach(() => fake.__reset());

const sample = (over = {}) => ({
  pseudo: 'Alice',
  age: 30,
  city: 'Paris',
  region: '11',
  country: 'FR',
  countryLabel: 'France',
  lon: 2.3488,
  lat: 48.85341,
  pub: 'CLE_PUBLIQUE_E2E',
  ...over,
});

test('createSession + getSession : aller-retour avec typage correct', async () => {
  await sessions.createSession('s1', sample());
  const s = await sessions.getSession('s1');
  assert.ok(s);
  assert.equal(s.id, 's1');
  assert.equal(s.pseudo, 'Alice');
  assert.equal(s.age, 30);
  assert.equal(typeof s.age, 'number');
  assert.equal(s.city, 'Paris');
  assert.equal(typeof s.lon, 'number');
  assert.equal(typeof s.lat, 'number');
  assert.equal(s.pub, 'CLE_PUBLIQUE_E2E');
});

test('getSession : null si la session n\'existe pas', async () => {
  assert.equal(await sessions.getSession('inconnu'), null);
});

test('touch : true si la session vit, false si elle a expiré', async () => {
  await sessions.createSession('s1', sample());
  assert.equal(await sessions.touch('s1'), true);
  assert.equal(await sessions.touch('jamais-creee'), false);
});

test('setPseudo : renomme une session vivante, refuse une session expirée', async () => {
  await sessions.createSession('s1', sample());
  assert.equal(await sessions.setPseudo('s1', 'Alicia'), true);
  const s = await sessions.getSession('s1');
  assert.equal(s.pseudo, 'Alicia');
  // Le reste de l'identité déclarée est intact.
  assert.equal(s.age, 30);
  assert.equal(s.city, 'Paris');
  assert.equal(s.pub, 'CLE_PUBLIQUE_E2E');
  // Une session disparue ne se ressuscite pas par un renommage.
  assert.equal(await sessions.setPseudo('jamais-creee', 'Fantôme'), false);
  assert.equal(await sessions.getSession('jamais-creee'), null);
});

test('toPublic : expose le profil sans coordonnées précises (§5.2)', () => {
  const pub = sessions.toPublic({ id: 's1', ...sample(), lon: 2.3, lat: 48.8 });
  assert.equal(pub.id, 's1');
  assert.equal(pub.pseudo, 'Alice');
  assert.equal(pub.age, 30);
  assert.equal(pub.city, 'Paris');
  assert.equal(pub.pub, 'CLE_PUBLIQUE_E2E');
  // Aucune coordonnée géographique précise dans le profil public.
  assert.equal('lon' in pub, false);
  assert.equal('lat' in pub, false);
});

test('toPublic : null reste null', () => {
  assert.equal(sessions.toPublic(null), null);
});

test('getPublicProfile : profil public d\'une session existante', async () => {
  await sessions.createSession('s1', sample());
  const p = await sessions.getPublicProfile('s1');
  assert.equal(p.pseudo, 'Alice');
  assert.equal('lon' in p, false);
});

test('publicProfiles : ignore et nettoie les fantômes (sessions expirées indexées)', async () => {
  await sessions.createSession('vivante', sample({ pseudo: 'Bob' }));
  // « fantome » est dans l'index GEO mais n'a pas de session.
  await geo.addPresence('fantome', 2.35, 48.86);

  const profils = await sessions.publicProfiles(['vivante', 'fantome']);
  assert.equal(profils.length, 1);
  assert.equal(profils[0].pseudo, 'Bob');

  // Nettoyage paresseux : le fantôme a été retiré de l'index de présence.
  assert.deepEqual(await geo.nearbyIds('vivante'), []);
});

test('deleteSession : supprime la session et la présence', async () => {
  await sessions.createSession('s1', sample());
  await geo.addPresence('s1', 2.3488, 48.85341);
  await sessions.deleteSession('s1');
  assert.equal(await sessions.getSession('s1'), null);
});
