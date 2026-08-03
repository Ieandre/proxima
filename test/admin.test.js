'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Le secret opérateur doit être défini avant le require de `admin` (qui charge `config`).
process.env.OPERATOR_SECRET = 'jeton-operateur-test';

// `admin` charge des modules dépendant de Redis (moderation/rooms/...) : on injecte le fake d'abord.
require('./helpers/inject-redis');
const admin = require('../server/admin');

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
  assert.equal(run({ token: 'jeton-operateur-test' }), undefined, 'bon jeton -> next() sans erreur');
});
