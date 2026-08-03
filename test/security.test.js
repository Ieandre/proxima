'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Injecte le fake Redis avant de charger security (qui require ./redis).
const { fake } = require('./helpers/inject-redis');
const security = require('../server/security');
const config = require('../server/config');

beforeEach(() => fake.__reset());

test('hashIp : déterministe pour une même IP (à sel constant)', () => {
  assert.equal(security.hashIp('203.0.113.7'), security.hashIp('203.0.113.7'));
});

test('hashIp : empreinte de 22 caractères base64url', () => {
  const h = security.hashIp('203.0.113.7');
  assert.equal(h.length, 22);
  assert.match(h, /^[A-Za-z0-9_-]{22}$/);
});

test('hashIp : irréversible — ne contient pas l\'IP en clair', () => {
  const ip = '198.51.100.42';
  assert.ok(!security.hashIp(ip).includes(ip));
});

test('hashIp : IP différentes -> empreintes différentes', () => {
  assert.notEqual(security.hashIp('203.0.113.7'), security.hashIp('203.0.113.8'));
});

test('isRateLimited : sous la limite renvoie false, au-delà renvoie true', async () => {
  const ip = '203.0.113.10';
  const max = config.rateLimit.maxEvents;
  for (let i = 0; i < max; i++) {
    assert.equal(await security.isRateLimited(ip), false, `événement ${i + 1} doit passer`);
  }
  // Le (max + 1)-ième dépasse la limite.
  assert.equal(await security.isRateLimited(ip), true);
});

test('isRateLimited : compteurs indépendants par IP', async () => {
  const max = config.rateLimit.maxEvents;
  for (let i = 0; i < max; i++) await security.isRateLimited('203.0.113.20');
  // Une autre IP repart de zéro.
  assert.equal(await security.isRateLimited('203.0.113.21'), false);
});

// --- clientIp : extraction résistante au spoofing de X-Forwarded-For (RG-08) ---
// config.trustedProxies = 1 par défaut (prod derrière un unique reverse proxy).

test('clientIp : sans X-Forwarded-For, retombe sur le pair TCP', () => {
  assert.equal(security.clientIp({ headers: {}, address: '203.0.113.9' }), '203.0.113.9');
});

test('clientIp : ne fait PAS confiance au maillon de gauche (anti-spoofing)', () => {
  // Le client préfixe une IP forgée ; notre proxy ajoute la vraie à droite.
  const ip = security.clientIp({
    headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.77' },
    address: '10.0.0.1',
  });
  assert.equal(ip, '203.0.113.77'); // le maillon ajouté par NOTRE proxy, pas la forgerie
});

test('clientIp : X-Forwarded-For à un seul maillon est utilisé tel quel', () => {
  assert.equal(
    security.clientIp({ headers: { 'x-forwarded-for': '198.51.100.5' }, address: '10.0.0.1' }),
    '198.51.100.5',
  );
});

test('securityHeaders : pose les en-têtes de durcissement et appelle next()', () => {
  const headers = {};
  const res = { setHeader: (k, v) => (headers[k] = v) };
  let nextCalled = false;
  security.securityHeaders({}, res, () => (nextCalled = true));

  assert.equal(nextCalled, true);
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['Referrer-Policy'], 'no-referrer');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.match(headers['Permissions-Policy'], /geolocation=\(\)/);
  assert.match(headers['Content-Security-Policy'], /default-src 'self'/);
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(headers['Content-Security-Policy'], /object-src 'none'/);
});

test('securityHeaders : pas de HSTS hors TLS (config par défaut)', () => {
  const headers = {};
  const res = { setHeader: (k, v) => (headers[k] = v) };
  security.securityHeaders({}, res, () => {});
  assert.equal('Strict-Transport-Security' in headers, false);
});

// --- Gel du sel IP : préservation prospective (exception bornée à RG-08) ----
// Ces tests déclenchent volontairement la rotation ; ils sont en fin de fichier
// pour ne pas perturber les assertions de déterminisme « à sel constant » ci-dessus.

test('freezeSalt : fige hashIp malgré une rotation déclenchée (préservation prospective)', () => {
  const ip = '203.0.113.50';
  security.freezeSalt();
  const before = security.hashIp(ip);
  security.rotateSalt(); // une rotation tente de s'exécuter pendant le gel
  assert.equal(security.isSaltFrozen(), true);
  assert.equal(security.hashIp(ip), before); // sel inchangé -> empreinte stable
  security.unfreezeSalt();
});

test('unfreezeSalt : rétablit la rotation (le sel change de nouveau)', () => {
  const ip = '203.0.113.51';
  security.unfreezeSalt(); // repart d'un état non gelé
  const before = security.hashIp(ip);
  security.rotateSalt(); // rotation effective hors gel
  assert.equal(security.isSaltFrozen(), false);
  assert.notEqual(security.hashIp(ip), before); // sel régénéré -> empreinte différente
});

// ==========================================================================
// SERVICE ONION TOR (design 2026-07-29)
// ==========================================================================
//
// `config` est un singleton lu au boot : les tests qui dépendent de `onion.host`
// ou de `hsts` le modifient et le restaurent, comme le fait déjà `config.test.js`.

/** Requête telle que Caddy la présente à Node depuis le bloc onion. */
const onionReq = (extra = {}) => ({
  path: '/',
  url: '/',
  headers: { [config.onion.marker]: '1', 'x-forwarded-for': '127.0.0.1' },
  address: '127.0.0.1',
  ...extra,
});

/** Requête clearnet ordinaire (IP publique dans X-Forwarded-For, posé par Caddy). */
const clearnetReq = (extra = {}) => ({
  path: '/',
  url: '/',
  headers: { 'x-forwarded-for': '198.51.100.7' },
  address: '127.0.0.1',
  ...extra,
});

const headersOf = (req) => {
  const headers = {};
  security.securityHeaders(req, { setHeader: (k, v) => (headers[k] = v) }, () => {});
  return headers;
};

/**
 * Asynchrone à dessein : un `finally` synchrone restaurerait `config.onion.host`
 * dès la première suspension du corps, donc avant les assertions qui suivent.
 */
const withOnionHost = async (host, fn) => {
  const before = config.onion.host;
  config.onion.host = host;
  try {
    return await fn();
  } finally {
    config.onion.host = before;
  }
};

test('isOnionRequest : marqueur posé par Caddy en loopback -> vrai', () => {
  assert.equal(security.isOnionRequest(onionReq()), true);
});

test('isOnionRequest : aucun marqueur -> faux', () => {
  assert.equal(security.isOnionRequest(clearnetReq()), false);
});

/**
 * LE test qui compte. Sans le doublement loopback de `isOnionRequest`, n'importe
 * quel visiteur du clearnet basculerait sur le régime onion en forgeant l'en-tête
 * — et échapperait à la limitation par IP. La contre-mesure de premier rang est
 * dans le Caddyfile (hors dépôt) ; celle-ci vit ici, donc elle est testable.
 */
test('isOnionRequest : marqueur FORGÉ par un client du clearnet -> sans effet', () => {
  const forged = clearnetReq({
    headers: { [config.onion.marker]: '1', 'x-forwarded-for': '198.51.100.7' },
  });
  assert.equal(security.isOnionRequest(forged), false);
});

test('securityHeaders : pas de HSTS sur l\'onion, présent sinon', () => {
  const before = config.hsts;
  config.hsts = true;
  try {
    assert.equal('Strict-Transport-Security' in headersOf(clearnetReq()), true);
    assert.equal('Strict-Transport-Security' in headersOf(onionReq()), false);
  } finally {
    config.hsts = before;
  }
});

test('Onion-Location : annoncé sur le clearnet, avec la valeur exacte', async () => {
  await withOnionHost('proximaexample.onion', () => {
    assert.equal(headersOf(clearnetReq())['Onion-Location'], 'http://proximaexample.onion/');
  });
});

test('Onion-Location : jamais émis quand ONION_HOST est vide', async () => {
  await withOnionHost('', () => {
    assert.equal('Onion-Location' in headersOf(clearnetReq()), false);
  });
});

test('Onion-Location : jamais émis sur l\'onion lui-même (auto-référence)', async () => {
  await withOnionHost('proximaexample.onion', () => {
    assert.equal('Onion-Location' in headersOf(onionReq()), false);
  });
});

/** Tor Browser n'honore l'en-tête que sur une navigation de premier niveau. */
test('Onion-Location : uniquement sur `/`, pas sur les autres chemins', async () => {
  await withOnionHost('proximaexample.onion', () => {
    const api = clearnetReq({ path: '/api/legal', url: '/api/legal' });
    assert.equal('Onion-Location' in headersOf(api), false);
  });
});

// --- Non-indexation : source unique (l'onion est soumis à Ahmia) -----------

test('isUnindexable : chemins techniques et DEUX formes de lien d\'invitation', () => {
  assert.equal(security.isUnindexable({ url: '/api/cities?q=lux' }), true);
  assert.equal(security.isUnindexable({ url: '/operator' }), true);
  assert.equal(security.isUnindexable({ url: '/socket.io/socket.io.js' }), true);
  assert.equal(security.isUnindexable({ url: '/?r=salon&k=cle' }), true);
  // `?i=` : invitation de conversation privée (design 2026-08-03). Traitée
  // jusqu'ici par un middleware séparé d'index.js — la règle vit désormais ici.
  assert.equal(security.isUnindexable({ url: '/?i=jeton' }), true);
  assert.equal(security.isUnindexable({ url: '/' }), false);
});

test('robotsDirective : `follow` pour une invitation, `nofollow` pour la technique', () => {
  assert.equal(security.robotsDirective({ url: '/?i=jeton' }), 'noindex, follow');
  assert.equal(security.robotsDirective({ url: '/?r=salon&k=cle' }), 'noindex, follow');
  assert.equal(security.robotsDirective({ url: '/api/cities?q=lux' }), 'noindex, nofollow');
  assert.equal(security.robotsDirective({ url: '/' }), null);
});

// --- Les deux seaux onion --------------------------------------------------

test('isOnionRateLimited : deux connexions distinctes ne partagent PAS leur compteur', async () => {
  const max = config.rateLimit.maxEvents;
  // La connexion A épuise son seau ; B doit rester intacte — c'est tout l'objet
  // du dispositif (sans lui, un bavard ferait taire tout le trafic Tor).
  for (let i = 0; i < max; i++) assert.equal(await security.isOnionRateLimited('sockA'), false);
  assert.equal(await security.isOnionRateLimited('sockA'), true);
  assert.equal(await security.isOnionRateLimited('sockB'), false);
});

test('isOnionRateLimited : le plafond global finit par déclencher', async () => {
  const before = config.onion.globalRlMax;
  config.onion.globalRlMax = 5;
  try {
    // Une connexion différente à chaque appel : seul le seau global peut sauter.
    for (let i = 0; i < 5; i++) assert.equal(await security.isOnionRateLimited(`s${i}`), false);
    assert.equal(await security.isOnionRateLimited('s5'), true);
  } finally {
    config.onion.globalRlMax = before;
  }
});

test('isOnionRateLimited : le trafic onion n\'entame pas le seau clearnet', async () => {
  const max = config.rateLimit.maxEvents;
  for (let i = 0; i <= max; i++) await security.isOnionRateLimited('sockA');
  // Un visiteur du clearnet ne doit rien subir de l'activité onion.
  assert.equal(await security.isRateLimited('198.51.100.7'), false);
});

// --- Sonde du bloc Caddy manquant ------------------------------------------

test('noteUnmarkedLoopback : muette quand aucun onion n\'est annoncé', async () => {
  await withOnionHost('', async () => {
    assert.equal(await security.noteUnmarkedLoopback('127.0.0.1'), false);
  });
});

test('noteUnmarkedLoopback : ignore une IP publique (visiteur clearnet ordinaire)', async () => {
  await withOnionHost('proximaexample.onion', async () => {
    assert.equal(await security.noteUnmarkedLoopback('198.51.100.7'), false);
  });
});

/**
 * Le symptôme du bloc onion absent du Caddyfile : tout le trafic Tor retombe
 * alors sur le compteur de 127.0.0.1, et un seul utilisateur fait taire les
 * autres — sans le moindre signal. D'où ce compteur, remonté par metrics.js.
 */
test('noteUnmarkedLoopback : loopback sans marqueur -> compté pour l\'opérateur', async () => {
  await withOnionHost('proximaexample.onion', async () => {
    assert.equal(await security.noteUnmarkedLoopback('127.0.0.1'), true);
    const counters = await security.onionCounters();
    assert.equal(counters.enabled, true);
    assert.equal(counters.unmarkedLoopback, 1);
  });
});

test('onionCounters : compteurs à zéro et service désactivé par défaut', async () => {
  const counters = await security.onionCounters();
  assert.equal(counters.enabled, false);
  assert.equal(counters.globalRateLimited, 0);
  assert.equal(counters.unmarkedLoopback, 0);
});
