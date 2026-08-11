'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Fake-Redis injecté AVANT tout module serveur (comme les autres suites).
const { fake } = require('./helpers/inject-redis');
const config = require('../server/config');
const geo = require('../server/domain/geo');
const rooms = require('../server/domain/rooms');
const analytics = require('../server/domain/analytics');
const audience = require('../server/audience');

/**
 * Instant fixe, en plein milieu d'une journée parisienne : les clés de jour et les
 * créneaux dépendent du fuseau, un test calé sur `Date.now()` basculerait de journée
 * une fois par nuit. 14 h 00 heure de Paris le 11 août 2026.
 */
const NOON = Date.parse('2026-08-11T12:00:00Z');
const DAY = '2026-08-11';

beforeEach(() => fake.__reset());

// ---------------------------------------------------------------------------
// Découpage du temps
// ---------------------------------------------------------------------------

test('dayKey : découpe la journée dans le fuseau d’exploitation, pas en UTC', () => {
  // 23 h 30 UTC le 11 août = 1 h 30 le 12 à Paris (UTC+2 en été). Une découpe UTC
  // rangerait cette visite la veille, et le tableau de bord serait faux chaque nuit.
  assert.equal(analytics.dayKey(Date.parse('2026-08-11T23:30:00Z')), '2026-08-12');
  assert.equal(analytics.dayKey(Date.parse('2026-08-11T12:00:00Z')), '2026-08-11');
});

test('slotOf : un créneau par pas d’échantillonnage, borné à la journée', () => {
  const perDay = Math.round(86400000 / config.analytics.sampleMs);
  const midnight = analytics.slotOf(Date.parse('2026-08-11T22:00:00Z')); // 00 h 00 à Paris
  assert.equal(midnight, 0);
  // 14 h 00 à Paris = 168e créneau de 5 minutes.
  assert.equal(analytics.slotOf(NOON), Math.floor((14 * 60 * 60000) / config.analytics.sampleMs));
  assert.ok(analytics.slotOf(NOON) < perDay);
});

test('lastDays : rend la fenêtre du plus ancien au plus récent, bornes incluses', () => {
  assert.deepEqual(analytics.lastDays(3, NOON), ['2026-08-09', '2026-08-10', '2026-08-11']);
  assert.deepEqual(analytics.lastDays(1, NOON), [DAY]);
});

// ---------------------------------------------------------------------------
// Comptage
// ---------------------------------------------------------------------------

test('recordPageView : range le chargement sous son chemin et compte la visite', async () => {
  await analytics.recordPageView({ path: '/', ipHash: 'h1', ts: NOON });
  await analytics.recordPageView({ path: '/', ipHash: 'h2', ts: NOON });
  await analytics.recordPageView({ path: '/tchat/nancy', ipHash: 'h1', ts: NOON });

  const views = await fake.hGetAll(`${analytics.K.views}${DAY}`);
  assert.deepEqual(views, { '/': '2', '/tchat/nancy': '1' });
});

test('recordPageView : la visite dénombre les hashs DISTINCTS, pas les chargements', async () => {
  // Trois chargements, deux hashs : la visite ne suit pas la page vue.
  await analytics.recordPageView({ path: '/', ipHash: 'h1', ts: NOON });
  await analytics.recordPageView({ path: '/cgu', ipHash: 'h1', ts: NOON });
  await analytics.recordPageView({ path: '/', ipHash: 'h2', ts: NOON });

  const summary = await analytics.summary({ days: 1, now: NOON });
  assert.equal(summary.totals.views, 3);
  assert.equal(summary.totals.visits, 2);
});

test('recordPageView : sans hash d’IP, le chargement compte mais pas la visite', async () => {
  // Mieux vaut un chiffre bas qu'un chiffre fabriqué : on ne devine pas un visiteur.
  await analytics.recordPageView({ path: '/', ts: NOON });
  const summary = await analytics.summary({ days: 1, now: NOON });
  assert.equal(summary.totals.views, 1);
  assert.equal(summary.totals.visits, 0);
});

test('recordPageView : sans chemin, rien n’est écrit', async () => {
  await analytics.recordPageView({ ipHash: 'h1', ts: NOON });
  assert.deepEqual(await fake.hGetAll(`${analytics.K.views}${DAY}`), {});
});

test('recordPageView : une arrivée sans référent est rangée en direct', async () => {
  await analytics.recordPageView({ path: '/', ipHash: 'h1', ts: NOON });
  const refs = await fake.hGetAll(`${analytics.K.refs}${DAY}`);
  assert.deepEqual(refs, { [analytics.REF_DIRECT]: '1' });
});

test('recordPageView : le domaine référent est compté tel qu’on le lui donne', async () => {
  await analytics.recordPageView({ path: '/', ipHash: 'h1', referrerHost: 'google.com', ts: NOON });
  await analytics.recordPageView({ path: '/', ipHash: 'h2', referrerHost: 'google.com', ts: NOON });
  await analytics.recordPageView({ path: '/', ipHash: 'h3', referrerHost: 'reddit.com', ts: NOON });

  const refs = await fake.hGetAll(`${analytics.K.refs}${DAY}`);
  assert.equal(refs['google.com'], '2');
  assert.equal(refs['reddit.com'], '1');
});

test('recordReferrer : au-delà du plafond, les domaines NEUFS tombent dans un seul seau', async () => {
  const max = config.analytics.maxReferrerHosts;
  for (let i = 0; i < max; i += 1) {
    await analytics.recordPageView({ path: '/', ipHash: 'h', referrerHost: `site${i}.example`, ts: NOON });
  }
  await analytics.recordPageView({ path: '/', ipHash: 'h', referrerHost: 'de-trop.example', ts: NOON });

  const refs = await fake.hGetAll(`${analytics.K.refs}${DAY}`);
  assert.equal(refs['de-trop.example'], undefined);
  assert.equal(refs[analytics.REF_OVERFLOW], '1');
});

test('recordReferrer : un domaine DÉJÀ connu continue d’avancer une fois le plafond atteint', async () => {
  // Sans cette nuance, le classement se figerait sur la matinée : les domaines déjà
  // comptés cesseraient de monter au moment précis où le trafic devient intéressant.
  const max = config.analytics.maxReferrerHosts;
  await analytics.recordPageView({ path: '/', ipHash: 'h', referrerHost: 'premier.example', ts: NOON });
  for (let i = 1; i < max; i += 1) {
    await analytics.recordPageView({ path: '/', ipHash: 'h', referrerHost: `site${i}.example`, ts: NOON });
  }
  await analytics.recordPageView({ path: '/', ipHash: 'h', referrerHost: 'premier.example', ts: NOON });

  const refs = await fake.hGetAll(`${analytics.K.refs}${DAY}`);
  assert.equal(refs['premier.example'], '2');
  assert.equal(refs[analytics.REF_OVERFLOW], undefined);
});

test('recordMessage / recordNotFound : compteurs journaliers indépendants', async () => {
  await analytics.recordMessage(NOON);
  await analytics.recordMessage(NOON);
  await analytics.recordNotFound(NOON);

  const summary = await analytics.summary({ days: 1, now: NOON });
  assert.equal(summary.totals.messages, 2);
  assert.equal(summary.totals.notFound, 1);
});

// ---------------------------------------------------------------------------
// Affluence échantillonnée
// ---------------------------------------------------------------------------

test('sampleTraffic : relève l’affluence globale dans le créneau courant', async () => {
  await geo.addPresence('s1', 2.35, 48.85);
  await geo.addPresence('s2', 2.34, 48.86);
  await rooms.createRoom({ name: 'Salon A', type: 'public', ownerId: 's1' });

  const point = await analytics.sampleTraffic(NOON);
  assert.equal(point.sessions, 2);
  assert.equal(point.rooms, 1);
  assert.equal(point.members, 1); // le propriétaire est membre

  const series = await fake.hGetAll(`${analytics.K.series}${DAY}`);
  assert.equal(series[String(analytics.slotOf(NOON))], '2,1,1');
});

test('sampleTraffic : c’est une JAUGE — deux relevés du même créneau ne s’additionnent pas', async () => {
  // Plusieurs instances échantillonnent le même Redis : un incrément multiplierait
  // l'affluence par leur nombre. `hSet` les rend idempotentes.
  await geo.addPresence('s1', 2.35, 48.85);
  await analytics.sampleTraffic(NOON);
  await analytics.sampleTraffic(NOON);

  const series = await fake.hGetAll(`${analytics.K.series}${DAY}`);
  assert.equal(series[String(analytics.slotOf(NOON))], '1,0,0');
});

// ---------------------------------------------------------------------------
// Synthèse
// ---------------------------------------------------------------------------

test('summary : agrège la fenêtre et classe pages et sources par ordre décroissant', async () => {
  const hier = NOON - 86400000;
  await analytics.recordPageView({ path: '/', ipHash: 'a', referrerHost: 'google.com', ts: hier });
  await analytics.recordPageView({ path: '/', ipHash: 'b', referrerHost: 'google.com', ts: NOON });
  await analytics.recordPageView({ path: '/tchat/nancy', ipHash: 'c', referrerHost: 'reddit.com', ts: NOON });

  const summary = await analytics.summary({ days: 2, now: NOON });

  assert.equal(summary.totals.views, 3);
  assert.equal(summary.daily.length, 2);
  assert.deepEqual(
    summary.daily.map((d) => d.day),
    ['2026-08-10', DAY],
  );
  assert.deepEqual(summary.pages[0], { key: '/', value: 2 });
  assert.deepEqual(summary.referrers[0], { key: 'google.com', value: 2 });
});

test('summary : la fenêtre est bornée par la rétention (rien à lire au-delà)', async () => {
  const summary = await analytics.summary({ days: 9999, now: NOON });
  assert.equal(summary.window, config.analytics.retentionDays);
  assert.equal(summary.daily.length, config.analytics.retentionDays);
});

test('summary : un jour sans trafic vaut zéro, jamais NaN ni absence', async () => {
  const summary = await analytics.summary({ days: 3, now: NOON });
  assert.equal(summary.daily.length, 3);
  for (const d of summary.daily) {
    assert.equal(d.views, 0);
    assert.equal(d.visits, 0);
    assert.equal(d.peakSessions, 0);
  }
  assert.deepEqual(summary.pages, []);
});

test('summary : le pic de sessions du jour sort de la série échantillonnée', async () => {
  const key = `${analytics.K.series}${DAY}`;
  await fake.hSet(key, '10', '4,1,3');
  await fake.hSet(key, '20', '11,2,9'); // le pic
  await fake.hSet(key, '30', '7,2,5');

  const summary = await analytics.summary({ days: 1, now: NOON });
  assert.equal(summary.daily[0].peakSessions, 11);
  assert.equal(summary.totals.peakSessions, 11);
});

test('summary : la série fine est triée par créneau et tolère une valeur abîmée', async () => {
  const key = `${analytics.K.series}${DAY}`;
  await fake.hSet(key, '30', '7,2,5');
  await fake.hSet(key, '10', '4,1,3');
  await fake.hSet(key, '20', 'nimportequoi');

  const summary = await analytics.summary({ days: 1, now: NOON });
  const points = summary.series[summary.series.length - 1].points;
  assert.deepEqual(
    points.map((p) => p.slot),
    [10, 20, 30],
  );
  assert.deepEqual(points[1], { slot: 20, sessions: 0, rooms: 0, members: 0 });
});

// ---------------------------------------------------------------------------
// Collecte HTTP (`audience.js`)
// ---------------------------------------------------------------------------

test('declaredPath : ne reconnaît que les routes déclarées', () => {
  assert.equal(audience.declaredPath('/'), '/');
  assert.equal(audience.declaredPath('/cgu'), '/cgu');
  // La barre finale désigne la même page — sinon `/cgu` et `/cgu/` feraient deux lignes.
  assert.equal(audience.declaredPath('/cgu/'), '/cgu');
  assert.equal(audience.declaredPath('/tchat/nancy'), '/tchat/nancy');
});

test('declaredPath : tout le reste est hors du compte', () => {
  // C'est LA garantie de cardinalité : aucune chaîne venue du dehors n'atteint Redis.
  assert.equal(audience.declaredPath('/nimportequoi'), null);
  assert.equal(audience.declaredPath('/api/cities'), null);
  assert.equal(audience.declaredPath('/operator'), null);
  assert.equal(audience.declaredPath('/assets/index-abc123.js'), null);
  assert.equal(audience.declaredPath('/tchat/ville-inventee'), null);
  assert.equal(audience.declaredPath('/%E0%A4%A'), null); // séquence %XX invalide
});

test('normalizeReferrer : réduit à l’hôte, sans www ni chemin', () => {
  assert.equal(audience.normalizeReferrer('https://www.google.com/search?q=proxima', 'proximachat.eu'), 'google.com');
  assert.equal(audience.normalizeReferrer('https://forum.example.org/t/42', 'proximachat.eu'), 'forum.example.org');
});

test('normalizeReferrer : une navigation interne n’est pas une source de trafic', () => {
  // Sans cela, le classement des backlinks commencerait par nous-mêmes.
  assert.equal(audience.normalizeReferrer('https://proximachat.eu/cgu', 'proximachat.eu'), '');
  assert.equal(audience.normalizeReferrer('https://www.proximachat.eu/cgu', 'proximachat.eu'), '');
  assert.equal(audience.normalizeReferrer('https://proximachat.eu/', 'www.proximachat.eu'), '');
});

test('normalizeReferrer : une valeur absente, illisible ou forgée vaut direct', () => {
  assert.equal(audience.normalizeReferrer('', 'proximachat.eu'), '');
  assert.equal(audience.normalizeReferrer(undefined, 'proximachat.eu'), '');
  assert.equal(audience.normalizeReferrer('pas une url', 'proximachat.eu'), '');
  assert.equal(audience.normalizeReferrer(`https://${'a'.repeat(80)}.com/`, 'proximachat.eu'), '');
});

test('BOT_RE : reconnaît les explorateurs, laisse passer un vrai navigateur', () => {
  const bots = [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0)',
    'facebookexternalhit/1.1',
    'curl/8.4.0',
  ];
  for (const ua of bots) assert.ok(audience.BOT_RE.test(ua), ua);

  const humains = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0',
  ];
  for (const ua of humains) assert.ok(!audience.BOT_RE.test(ua), ua);
});
