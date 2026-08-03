'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Sans variables d'environnement définies, config expose les valeurs par défaut
// qui encodent des règles métier (rayon RG-03, âge minimum RG-04, TTL §4.1…).
// Ces tests servent de garde-fou contre une modification accidentelle.
const config = require('../server/config');

test('config : valeurs réseau par défaut', () => {
  assert.equal(config.port, 3000);
  assert.equal(config.redisUrl, 'redis://127.0.0.1:6379');
});

test('config : rayon de proximité par défaut (RG-03)', () => {
  assert.equal(config.radiusKm, 75);
});

test('config : accès réservé aux majeurs (RG-04)', () => {
  assert.equal(config.minAge, 18);
  assert.equal(config.maxAge, 120);
});

test('config : durées de vie volatiles (§4.1)', () => {
  assert.equal(config.ttl.sessionSec, 90);
  assert.equal(config.ttl.roomSec, 86400);
});

test('config : rotation du sel IP et anti-spam (RG-08, §5.1)', () => {
  assert.equal(config.ipSalt.rotateMs, 5 * 60 * 1000);
  assert.equal(config.rateLimit.windowSec, 10);
  assert.equal(config.rateLimit.maxEvents, 30);
});

test('config : HSTS désactivé par défaut (activé seulement derrière TLS)', () => {
  assert.equal(config.hsts, false);
});
