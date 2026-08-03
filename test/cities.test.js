'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const cities = require('../server/domain/cities');

test('normalize : minuscules, sans accents, sans ponctuation, espaces réduits', () => {
  assert.equal(cities.normalize('Genève'), 'geneve');
  assert.equal(cities.normalize(' Saint-Étienne! '), 'saint etienne');
  assert.equal(cities.normalize('PARIS'), 'paris');
  assert.equal(cities.normalize('Aix-en-Provence'), 'aix en provence');
  assert.equal(cities.normalize(''), '');
  assert.equal(cities.normalize(null), '');
  assert.equal(cities.normalize(undefined), '');
});

test('normalize : développe les abréviations St / Ste', () => {
  // ~4 000 communes en Saint(e), et personne ne les écrit en entier : sans cela,
  // la forme la plus tapée ne trouvait rien.
  assert.equal(cities.normalize('St-Étienne'), 'saint etienne');
  assert.equal(cities.normalize('Ste Foy'), 'sainte foy');
  assert.equal(cities.normalize('Bourg-St-Maurice'), 'bourg saint maurice');
  // Un « st » qui n'est pas un mot ne bouge pas.
  assert.equal(cities.normalize('Ostende'), 'ostende');
});

// ---------------------------------------------------------------------------
// Exhaustivité de la base — les communes de moins de 1 200 habitants étaient
// absentes, soit 90 % de la France : c'est ce que cette suite protège.
// ---------------------------------------------------------------------------
test('base : couvre l’entièreté des communes des cinq pays', () => {
  const data = require('../server/data/cities.json');
  assert.ok(data.cities.length > 37000, `${data.cities.length} communes chargées, attendu > 37 000`);
  const parPays = {};
  for (const c of data.cities) parPays[c.c] = (parPays[c.c] || 0) + 1;
  assert.ok(parPays.FR > 34000, `France : ${parPays.FR}`);
  assert.ok(parPays.BE > 550, `Belgique : ${parPays.BE}`);
  assert.ok(parPays.CH > 2000, `Suisse : ${parPays.CH}`);
  assert.ok(parPays.LU >= 100, `Luxembourg : ${parPays.LU}`);
  assert.ok(parPays.MC >= 1, `Monaco : ${parPays.MC}`);
});

test('base : postal.json est synchronisé avec cities.json', () => {
  // L'index postal désigne les communes par leur rang : les deux fichiers sont
  // écrits ensemble par scripts/build-geo.js, et n'ont pas le droit de diverger.
  assert.equal(require('../server/data/postal.json').cities, require('../server/data/cities.json').cities.length);
});

test('suggest : trouve les plus petites communes des cinq pays', () => {
  const cas = [
    ['Rochefourchat', 'FR'], // 1 habitant
    ['Ouessant', 'FR'],
    ['Vielsalm', 'BE'],
    ['Isérables', 'CH'],
    ['Bech', 'LU'],
    ['Monte-Carlo', 'MC'],
  ];
  for (const [nom, pays] of cas) {
    const res = cities.suggest(nom, 3);
    assert.ok(
      res.some((c) => c.name === nom && c.country === pays),
      `${nom} (${pays}) introuvable : ${JSON.stringify(res)}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Résolution
// ---------------------------------------------------------------------------
test('geocode : résout une commune connue en coordonnées', () => {
  const paris = cities.geocode('Paris');
  assert.ok(paris, 'Paris doit être trouvée');
  assert.equal(paris.name, 'Paris');
  assert.equal(paris.country, 'FR');
  assert.equal(paris.countryLabel, 'France');
  assert.equal(typeof paris.lat, 'number');
  assert.equal(typeof paris.lon, 'number');
  // Coordonnées plausibles pour Paris.
  assert.ok(Math.abs(paris.lat - 48.85) < 0.1);
  assert.ok(Math.abs(paris.lon - 2.35) < 0.1);
});

test('geocode : insensible à la casse et aux espaces superflus', () => {
  assert.deepEqual(cities.geocode('  PARIS '), cities.geocode('paris'));
  assert.deepEqual(cities.geocode('paris'), cities.geocode('Paris'));
});

test('geocode : insensible aux accents et résout les alias', () => {
  const g = cities.geocode('Genève');
  assert.ok(g, 'Genève doit être résolue');
  assert.equal(g.country, 'CH');
  assert.equal(g.countryLabel, 'Suisse');
  // Le nom français d'une commune flamande est indexé en alias : le nom canonique
  // reste le nom officiel local.
  const a = cities.geocode('Anvers');
  assert.ok(a, 'Anvers doit mener à Antwerpen');
  assert.equal(a.name, 'Antwerpen');
  assert.equal(a.country, 'BE');
});

test('geocode : renvoie null pour une commune inconnue', () => {
  assert.equal(cities.geocode('Zzxqwville'), null);
  assert.equal(cities.geocode(''), null);
  assert.equal(cities.geocode('   '), null);
});

test('geocode : un nom homonyme désigne la commune la plus peuplée', () => {
  // Comportement documenté, et raison d'être de `resolve` : douze communes
  // s'appellent Sainte-Colombe, le nom seul ne désigne donc pas un lieu.
  const g = cities.geocode('Sainte-Colombe');
  assert.equal(g.name, 'Sainte-Colombe');
  assert.equal(g.admin, 'Rhône');
});

test('resolve : l’identifiant tranche entre les homonymes', () => {
  const parNom = cities.geocode('Sainte-Colombe');
  const parId = cities.resolve({ id: 'FR-77404', name: 'Sainte-Colombe' });
  assert.equal(parId.name, 'Sainte-Colombe');
  assert.equal(parId.admin, 'Seine-et-Marne');
  assert.notEqual(parId.id, parNom.id, 'ce doit être une autre commune que celle du nom seul');
});

test('resolve : l’identifiant l’emporte sur le nom, qui sert de repli', () => {
  // Un client plus ancien n'envoie qu'un nom : il ne doit pas se faire refuser.
  assert.equal(cities.resolve({ name: 'Metz' }).name, 'Metz');
  assert.equal(cities.resolve({ id: '', name: 'Metz' }).name, 'Metz');
  // Identifiant valide et nom contradictoire : l'identifiant décide.
  assert.equal(cities.resolve({ id: 'FR-57463', name: 'Bruxelles' }).name, 'Metz');
  // Identifiant inconnu : on retombe sur le nom plutôt que de refuser l'entrée.
  assert.equal(cities.resolve({ id: 'FR-00000', name: 'Metz' }).name, 'Metz');
  assert.equal(cities.resolve({ id: 'FR-00000', name: 'Zzxqwville' }), null);
  assert.equal(cities.resolve({}), null);
  assert.equal(cities.resolve(), null);
});

// ---------------------------------------------------------------------------
// Autocomplétion
// ---------------------------------------------------------------------------
test('suggest : priorise les préfixes et trie par population', () => {
  const res = cities.suggest('par', 3);
  assert.ok(Array.isArray(res));
  assert.ok(res.length > 0 && res.length <= 3);
  // La plus grande commune en préfixe « par » est Paris.
  assert.equal(res[0].name, 'Paris');
  // Chaque suggestion expose le profil public d'une commune, sans coordonnées.
  for (const s of res) {
    assert.deepEqual(Object.keys(s).sort(), ['admin', 'country', 'countryLabel', 'id', 'name', 'region']);
    assert.equal('lat' in s, false);
    assert.equal('lon' in s, false);
  }
});

test('suggest : le nom exactement tapé passe devant la population', () => {
  // « Sai » (Orne, 100 habitants) devant Saint-Étienne : ce qu'on a tapé en entier
  // est ce qu'on voulait, et l'ordre doit rester explicable.
  assert.equal(cities.suggest('sai', 3)[0].name, 'Sai');
  assert.equal(cities.suggest('metz', 3)[0].name, 'Metz');
});

test('suggest : reconnaît un mot au milieu du nom', () => {
  // Sans index de mots, « provence » ne trouvait pas Aix-en-Provence.
  const noms = cities.suggest('provence', 5).map((c) => c.name);
  assert.ok(noms.includes('Aix-en-Provence'), noms.join(' / '));
  assert.ok(noms.includes('Salon-de-Provence'), noms.join(' / '));
});

test('suggest : trouve une commune malgré son article initial', () => {
  const noms = cities.suggest('havre', 3).map((c) => c.name);
  assert.ok(noms.includes('Le Havre'), noms.join(' / '));
});

test('suggest : les homonymes sont tous proposés, chacun avec sa subdivision', () => {
  const res = cities.suggest('sainte-colombe', 12);
  assert.equal(res.length, 12);
  assert.ok(
    res.every((c) => c.name === 'Sainte-Colombe'),
    res.map((c) => c.name).join(' / '),
  );
  // C'est le libellé de subdivision qui rend la liste utilisable : sans lui, douze
  // lignes identiques ne permettent aucun choix.
  assert.equal(new Set(res.map((c) => c.admin)).size, 12);
  assert.equal(new Set(res.map((c) => c.id)).size, 12);
});

test('suggest : le libellé de subdivision suit le pays', () => {
  const un = (q) => cities.suggest(q, 1)[0];
  assert.equal(un('Metz').admin, 'Moselle'); // département
  assert.equal(un('Vielsalm').admin, 'Luxembourg'); // province belge
  assert.equal(un('Isérables').admin, 'Valais'); // canton suisse
  assert.equal(un('Schifflange').admin, 'Esch-sur-Alzette'); // canton luxembourgeois
  assert.equal(un('Monte-Carlo').admin, 'Monaco');
});

test('suggest : ignore les requêtes de moins de 2 caractères', () => {
  assert.deepEqual(cities.suggest('a'), []);
  assert.deepEqual(cities.suggest(''), []);
  assert.deepEqual(cities.suggest(' '), []);
});

test('suggest : respecte la limite demandée', () => {
  assert.ok(cities.suggest('saint', 5).length <= 5);
  assert.ok(cities.suggest('saint').length <= 10);
});

test('suggest : renvoie [] quand rien ne correspond', () => {
  assert.deepEqual(cities.suggest('zzxqw'), []);
});

// ---------------------------------------------------------------------------
// Saisie par code postal — on connaît son code mieux que l'orthographe de sa
// commune. Les codes français viennent de la fiche INSEE de chaque commune :
// exacts par construction, sans rattachement au plus proche.
// ---------------------------------------------------------------------------
test('suggest : un code postal exact propose sa commune', () => {
  const res = cities.suggest('57000', 5);
  assert.equal(res[0].name, 'Metz');
  assert.equal(res[0].postal, '57000');
  assert.equal(res[0].country, 'FR');
});

test('suggest : un code postal partiel propose déjà les codes qui le prolongent', () => {
  const res = cities.suggest('5700', 5);
  assert.ok(res.length > 0);
  assert.ok(res.every((s) => s.postal.startsWith('5700')));
});

test('suggest : le code d’une petite commune mène désormais à elle, sans détour', () => {
  // Ouessant (~800 habitants) était absente de la base : son code postal menait à
  // Ploudalmézeau, « pour Ouessant », à 40 km et un bras de mer de là.
  const res = cities.suggest('29242', 5);
  assert.equal(res[0].name, 'Ouessant');
  assert.equal(res[0].postal, '29242');
  assert.equal(res[0].via, undefined, 'plus de rattachement : la commune est dans la base');
});

test('suggest : une localité sans commune homonyme est rattachée, et le dit', () => {
  // Le rattachement subsiste hors de France, où l'export postal descend sous la
  // maille communale (hameaux, stations). Le nom du lieu est repris pour que la
  // proposition n'ait pas l'air de tomber du ciel.
  const res = cities.suggest('1944', 5);
  assert.equal(res[0].name, 'Orsières');
  assert.equal(res[0].country, 'CH');
  assert.equal(res[0].via, 'La Fouly VS');
});

test('suggest : un code partagé entre pays propose les deux', () => {
  const res = cities.suggest('1000', 8);
  const pays = new Set(res.map((s) => s.country));
  assert.ok(pays.has('BE') && pays.has('CH'), `pays proposés : ${[...pays]}`);
});

test('suggest : un code postal inexistant ne propose rien', () => {
  assert.deepEqual(cities.suggest('99999'), []);
});

test('geocode : accepte un code postal comme un nom de commune', () => {
  const g = cities.geocode('57000');
  assert.equal(g.name, 'Metz');
  assert.equal(g.country, 'FR');
  assert.ok(typeof g.lat === 'number' && typeof g.lon === 'number');
  assert.equal(cities.geocode('99999'), null);
});

// ---------------------------------------------------------------------------
// Libellé de région (design 2026-07-23) — nommage du salon de région
// ---------------------------------------------------------------------------
test('regionLabel : code connu -> libellé curé', () => {
  assert.equal(cities.regionLabel('FR', '11'), 'Île-de-France');
  assert.equal(cities.regionLabel('FR', '44'), 'Grand Est');
  assert.equal(cities.regionLabel('CH', 'GE'), 'Genève');
  assert.equal(cities.regionLabel('BE', 'WAL'), 'Wallonie');
  assert.equal(cities.regionLabel('LU', 'LU'), 'Luxembourg');
});

test('regionLabel : l’outre-mer est nommé, comme la métropole', () => {
  // Aucun de ces territoires n'était atteignable avant l'exhaustivité : leurs
  // salons de région se seraient appelés « Région de <commune> ».
  assert.equal(cities.regionLabel('FR', '04'), 'La Réunion');
  assert.equal(cities.regionLabel('FR', '988'), 'Nouvelle-Calédonie');
  assert.equal(cities.regionLabel('LU', 'CL'), 'Clervaux');
});

test('regionLabel : insensible à la casse du pays', () => {
  assert.equal(cities.regionLabel('fr', '11'), 'Île-de-France');
});

test('regionLabel : code absent de la table -> repli « Région de <commune> »', () => {
  // On force un code de région qui n'est pas dans REGION_LABEL et qu'aucune
  // commune ne porte : il n'y a alors pas de salon de région à nommer.
  assert.equal(cities.regionLabel('FR', 'ZZ'), null, 'code inconnu sans commune -> null');
});

test('regionLabel : code vide ou absent -> null (pas de salon de région)', () => {
  assert.equal(cities.regionLabel('FR', ''), null);
  assert.equal(cities.regionLabel('FR', null), null);
  assert.equal(cities.regionLabel('FR', undefined), null);
});
