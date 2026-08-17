'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('./helpers/inject-redis');
const config = require('../server/config');
const { ORIGIN } = require('../server/pages');
const { CITY_ROUTES, CITY_FILE_BY_PATH, cityPages, detail, slugFromPath, slugify } = require('../server/city-pages');
const { renderPage, cityShell } = require('../scripts/prerender-routes');

const ROOT = path.join(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'frontend', 'index.html');
const GENERATED = path.join(ROOT, 'frontend', 'src', 'lib', 'cities-seo.ts');
const ROUTER_TS = path.join(ROOT, 'frontend', 'src', 'lib', 'router.ts');

const SOURCE = fs.readFileSync(INDEX_HTML, 'utf8');

/* ==========================================================================
 * Sélection
 * ======================================================================== */

test('villes : la sélection est non vide et sans doublon', () => {
  assert.ok(CITY_ROUTES.length >= 40, `sélection trop maigre : ${CITY_ROUTES.length}`);

  const slugs = CITY_ROUTES.map((r) => r.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'slug en double');

  const files = CITY_ROUTES.map((r) => r.file);
  assert.equal(new Set(files).size, files.length, 'fichier en double');
});

// Une commune nommée dans `ABROAD` qui n'existe plus sous ce nom dans la base
// géographique est perdue en silence côté serveur (il ne doit pas refuser de
// démarrer). C'est ici qu'on l'apprend.
test('villes : toutes les villes nommées à la main ont été résolues', () => {
  const source = fs.readFileSync(path.join(ROOT, 'server', 'city-pages.js'), 'utf8');
  const block = source.match(/const ABROAD = \[([\s\S]*?)\n\];/);
  assert.ok(block, 'liste ABROAD introuvable');

  const named = [...block[1].matchAll(/name: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(named.length > 0, 'liste ABROAD vide');

  const resolved = new Set(CITY_ROUTES.map((r) => r.city.n));
  for (const name of named) {
    assert.ok(resolved.has(name), `« ${name} » n'existe plus sous ce nom dans cities.json`);
  }
});

test('villes : les slugs sont des segments d’URL propres', () => {
  for (const route of CITY_ROUTES) {
    assert.match(route.slug, /^[a-z0-9-]+$/, `slug impropre : ${route.slug}`);
    assert.equal(route.path, `/tchat/${route.slug}`);
    assert.equal(route.file, `tchat-${route.slug}.html`);
  }
});

test('villes : les ligatures survivent au slug', () => {
  assert.equal(slugify('Vandœuvre-lès-Nancy'), 'vandoeuvre-les-nancy');
  assert.equal(slugify("L'Haÿ-les-Roses"), 'l-hay-les-roses');
});

/* ==========================================================================
 * Métadonnées — les mêmes exigences que les pages écrites à la main
 * ======================================================================== */

test('villes : titre et description propres à chaque ville', () => {
  const pages = cityPages();
  const titles = pages.map((p) => p.title);
  const descriptions = pages.map((p) => p.description);

  assert.equal(new Set(titles).size, titles.length, 'titre en double');
  assert.equal(new Set(descriptions).size, descriptions.length, 'description en double');

  for (const page of pages) {
    assert.ok(page.title.length >= 15 && page.title.length <= 70, `titre de ${page.path} : ${page.title.length} car.`);
    assert.ok(
      page.description.length >= 70 && page.description.length <= 175,
      `description de ${page.path} : ${page.description.length} car.`,
    );
    assert.ok(page.intro.length >= 120, `intro trop courte pour ${page.path}`);
    assert.ok(page.heading.length > 0, `heading manquant pour ${page.path}`);
  }
});

/* ==========================================================================
 * Données de proximité
 * ======================================================================== */

test('villes : les voisines sont dans le rayon du service et ordonnées', () => {
  for (const route of CITY_ROUTES) {
    const city = detail(route.slug);
    assert.ok(city.nearby.length > 0, `${route.slug} : aucune commune voisine`);
    assert.ok(city.nearbyTotal >= city.nearby.length, `${route.slug} : total incohérent`);

    let previous = 0;
    for (const near of city.nearby) {
      assert.ok(near.km <= config.radiusKm, `${route.slug} : ${near.name} hors rayon (${near.km} km)`);
      assert.ok(near.km >= previous, `${route.slug} : voisines non triées par distance`);
      previous = near.km;
      assert.notEqual(near.name, city.name, `${route.slug} : se cite elle-même comme voisine`);
    }
  }
});

// Le lien vers une voisine ne doit exister que si la voisine a bien une page :
// un lien interne vers une 404 est un mauvais signal, et une promesse rompue.
test('villes : une voisine liée a toujours sa propre page', () => {
  const known = new Set(CITY_ROUTES.map((r) => r.slug));
  for (const route of CITY_ROUTES) {
    for (const near of detail(route.slug).nearby) {
      if (near.slug === null) continue;
      assert.ok(known.has(near.slug), `${route.slug} lie /tchat/${near.slug}, qui n'existe pas`);
    }
  }
});

test('villes : l’identifiant de commune a la forme attendue par identify', () => {
  for (const route of CITY_ROUTES) {
    assert.match(detail(route.slug).id, /^(FR|BE|CH|LU|MC)-[A-Za-z0-9]+$/, `${route.slug} : identifiant douteux`);
  }
});

/* ==========================================================================
 * Routage
 * ======================================================================== */

test('villes : seul un slug connu est une page', () => {
  assert.equal(slugFromPath(`/tchat/${CITY_ROUTES[0].slug}`), CITY_ROUTES[0].slug);
  assert.equal(slugFromPath(`/tchat/${CITY_ROUTES[0].slug}/`), CITY_ROUTES[0].slug);
  assert.equal(slugFromPath('/tchat/ville-qui-nexiste-pas'), null);
  assert.equal(slugFromPath('/tchat'), null);
  assert.equal(slugFromPath('/tchat/nancy/extra'), null);
  assert.equal(slugFromPath('/cgu'), null);
});

test('villes : la table chemin -> fichier couvre toute la sélection', () => {
  assert.equal(CITY_FILE_BY_PATH.size, CITY_ROUTES.length);
  for (const route of CITY_ROUTES) {
    assert.equal(CITY_FILE_BY_PATH.get(route.path), route.file);
  }
});

// Le routeur client doit reconnaître le même préfixe que le serveur, sans quoi
// un clic sur une voisine rechargerait la page — et détruirait la session.
test('villes : le routeur client reconnaît le préfixe /tchat', () => {
  const source = fs.readFileSync(ROUTER_TS, 'utf8');
  assert.match(source, /isCityPath/, 'router.ts ne reconnaît pas les pages de ville');
  assert.match(source, /cityFromPath/, 'router.ts ne valide pas le slug contre les données générées');
});

/* ==========================================================================
 * Fichier généré pour le client
 * ======================================================================== */

// `frontend/src/lib/cities-seo.ts` est écrit par `npm run build:seo-cities`. Un
// oubli de régénération après un changement de sélection doit casser la suite,
// pas la production : c'est le seul endroit où le décalage est détectable.
test('villes : le fichier généré du client est à jour', () => {
  const generated = fs.readFileSync(GENERATED, 'utf8');
  const block = generated.match(/export const SEO_CITIES: SeoCity\[\] = ([\s\S]*?);\n\nexport const CITY_BY_SLUG/);
  assert.ok(block, 'SEO_CITIES introuvable dans cities-seo.ts');

  const actual = JSON.parse(block[1]);
  const expected = cityPages().map((page) => {
    const city = detail(page.slug);
    return {
      slug: city.slug,
      id: city.id,
      name: city.name,
      title: page.title,
      description: page.description,
      subdivision: city.subdivision,
      country: city.country,
      population: city.population,
      nearbyTotal: city.nearbyTotal,
      nearby: city.nearby,
    };
  });

  assert.deepEqual(
    actual,
    expected,
    'cities-seo.ts est périmé — lancez `npm run build:seo-cities` à la racine',
  );
});

/* ==========================================================================
 * Pré-rendu
 * ======================================================================== */

test('pré-rendu ville : métadonnées et canonique propres à la ville', () => {
  for (const page of cityPages().slice(0, 5)) {
    const city = detail(page.slug);
    const html = renderPage(SOURCE, page, (p) => cityShell(p, city));
    const url = `${ORIGIN}${page.path}`;

    assert.ok(html.includes(`<link rel="canonical" href="${url}" />`), `canonique absente de ${page.path}`);
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1, `canonique en double sur ${page.path}`);
    assert.ok(!html.includes('application/ld+json'), `JSON-LD conservé sur ${page.path}`);
  }
});

// C'est tout l'enjeu de ces pages : la coquille doit porter la donnée propre à la
// ville. Sans elle, la page devient un gabarit avec un nom substitué, c'est-à-dire
// exactement la page satellite que Google sanctionne.
test('pré-rendu ville : la coquille porte les chiffres de la ville', () => {
  for (const page of cityPages().slice(0, 5)) {
    const city = detail(page.slug);
    const html = renderPage(SOURCE, page, (p) => cityShell(p, city));
    const shell = html.match(/<main id="seo-shell"[\s\S]*?<\/main>/);
    assert.ok(shell, `coquille absente de ${page.path}`);

    assert.ok(shell[0].includes(city.nearbyTotal.toLocaleString('fr-FR')), `${page.path} : total absent`);
    assert.ok(shell[0].includes(city.population.toLocaleString('fr-FR')), `${page.path} : population absente`);
    assert.ok(shell[0].includes(city.nearby[0].name.replace(/&/g, '&amp;')), `${page.path} : voisines absentes`);
    assert.ok(!shell[0].includes(`href="${page.path}"`), `${page.path} se lie à elle-même`);

    // Sortie vers le reste du site : sans ces liens, la page est un cul-de-sac.
    for (const exit of ['/villes', '/chat-anonyme', '/']) {
      assert.ok(shell[0].includes(`href="${exit}"`), `${page.path} ne lie pas ${exit}`);
    }
  }
});
