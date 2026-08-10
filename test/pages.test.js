'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Injecte le fake Redis avant de charger security (qui require ./redis).
require('./helpers/inject-redis');
const security = require('../server/security');
const { ORIGIN, PAGES, PRERENDERED } = require('../server/pages');
const { cityPages } = require('../server/city-pages');
const { renderPage, sitemap } = require('../scripts/prerender-routes');

const ROOT = path.join(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'frontend', 'index.html');
const ROUTER_TS = path.join(ROOT, 'frontend', 'src', 'lib', 'router.ts');

/* ==========================================================================
 * Cohérence de la déclaration des pages
 * ======================================================================== */

test('pages : chemins et fichiers uniques, sans slash final', () => {
  const paths = PAGES.map((p) => p.path);
  const files = PAGES.map((p) => p.file);
  assert.equal(new Set(paths).size, paths.length, 'chemin en double');
  assert.equal(new Set(files).size, files.length, 'fichier en double');

  for (const page of PAGES) {
    assert.ok(page.path.startsWith('/'), `${page.path} doit commencer par /`);
    assert.ok(page.path === '/' || !page.path.endsWith('/'), `${page.path} ne doit pas finir par /`);
    assert.ok(/^[a-z0-9/-]+$/.test(page.path), `${page.path} : minuscules, chiffres et tirets uniquement`);
    assert.ok(page.file.endsWith('.html'), `${page.file} doit être un .html`);
  }
});

// Servir le même titre et la même description sous plusieurs URLs ne crée pas
// plusieurs pages pour un moteur, mais des doublons qu'il regroupe sous une
// seule — ce qui annulerait tout le bénéfice des vraies routes.
test('pages : titre et description propres à chaque page', () => {
  const titles = PAGES.map((p) => p.title);
  const descriptions = PAGES.map((p) => p.description);
  assert.equal(new Set(titles).size, titles.length, 'titre en double');
  assert.equal(new Set(descriptions).size, descriptions.length, 'description en double');

  for (const page of PAGES) {
    assert.ok(page.title.length >= 15 && page.title.length <= 70, `titre de ${page.path} : ${page.title.length} car.`);
    assert.ok(
      page.description.length >= 70 && page.description.length <= 175,
      `description de ${page.path} : ${page.description.length} car.`,
    );
    assert.ok(page.heading.length > 0, `heading manquant pour ${page.path}`);
    assert.ok(page.nav.length > 0, `libellé de navigation manquant pour ${page.path}`);
  }

  // L'accueil est produit par Vite : son intro vit dans index.html, pas ici.
  for (const page of PRERENDERED) {
    assert.ok(page.intro.length >= 120, `intro trop courte pour ${page.path} (coquille sans contenu réel)`);
  }
});

test('pages : toutes indexables (aucune ne tombe sous une règle noindex)', () => {
  for (const page of PAGES) {
    assert.ok(!security.isUnindexable({ originalUrl: page.path }), `${page.path} ne devrait pas être noindex`);
  }
});

/* ==========================================================================
 * Accord entre les trois déclarations : serveur, sitemap, client
 * ======================================================================== */

test('pages : le sitemap liste exactement les pages déclarées', () => {
  const listed = [...sitemap('2026-01-01').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  // L'accueil s'écrit avec son slash final dans un sitemap ; les autres non.
  const expected = [
    ...PAGES.map((p) => (p.path === '/' ? `${ORIGIN}/` : `${ORIGIN}${p.path}`)),
    ...cityPages().map((p) => `${ORIGIN}${p.path}`),
  ];

  assert.deepEqual(listed.slice().sort(), expected.slice().sort(), 'sitemap désynchronisé des déclarations');
  assert.equal(new Set(listed).size, listed.length, 'URL en double dans le sitemap');
});

test('pages : le routeur client déclare les mêmes chemins que le serveur', () => {
  const source = fs.readFileSync(ROUTER_TS, 'utf8');
  const block = source.match(/export const PAGE_PATHS = \[([\s\S]*?)\]/);
  assert.ok(block, 'PAGE_PATHS introuvable dans lib/router.ts');

  const clientPaths = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const serverPaths = PRERENDERED.map((p) => p.path);

  assert.deepEqual(
    clientPaths.slice().sort(),
    serverPaths.slice().sort(),
    'lib/router.ts désynchronisé de server/pages.js',
  );
});

// Les liens de la coquille statique sont les seuls qu'un explorateur puisse
// suivre sans exécuter le bundle. Un fragment n'y mène nulle part : Google
// ignore tout ce qui suit le `#`.
test('pages : la coquille statique d’index.html lie de vrais chemins', () => {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const shell = html.match(/<main id="seo-shell"[\s\S]*?<\/main>/);
  assert.ok(shell, 'coquille #seo-shell introuvable');

  assert.ok(
    !/href="\/?#(cgu|confidentialite|moderation|mentions-legales|en-savoir-plus)"/.test(shell[0]),
    'la coquille lie encore des fragments de page',
  );
  for (const page of PRERENDERED) {
    if (page.path === '/en-savoir-plus') continue; // atteint depuis l'app, pas depuis le pied de page
    assert.ok(shell[0].includes(`href="${page.path}"`), `la coquille ne lie pas ${page.path}`);
  }
});

/* ==========================================================================
 * Pré-rendu
 * ======================================================================== */

const SOURCE = fs.readFileSync(INDEX_HTML, 'utf8');

test('pré-rendu : métadonnées propres à la page', () => {
  for (const page of PRERENDERED) {
    const html = renderPage(SOURCE, page);
    const url = `${ORIGIN}${page.path}`;

    assert.ok(html.includes(`<title>${escapeHtml(page.title)}</title>`), `titre non substitué pour ${page.path}`);
    assert.ok(
      html.includes(`<link rel="canonical" href="${url}" />`),
      `canonique non substituée pour ${page.path}`,
    );
    assert.ok(html.includes(`<meta property="og:url" content="${url}" />`), `og:url non substitué pour ${page.path}`);
    assert.ok(
      html.includes(`<meta name="description" content="${escapeHtml(page.description)}" />`),
      `description non substituée pour ${page.path}`,
    );

    // Une seule canonique et une seule description : la substitution ne doit pas
    // avoir ajouté une balise à côté de celle de l'accueil.
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1, `canonique en double sur ${page.path}`);
    assert.equal((html.match(/name="description"/g) || []).length, 1, `description en double sur ${page.path}`);

    // Aucune trace des métadonnées de l'accueil.
    assert.ok(!html.includes(`href="${ORIGIN}/"`), `canonique de l'accueil restée sur ${page.path}`);
  }
});

// Le FAQPage doit correspondre à une FAQ réellement visible sur la page qui le
// porte (règle Google sur les données structurées). Et tout bloc <script> exige
// son hash SHA-256 dans la CSP : pas de bloc, pas de hash à maintenir.
test('pré-rendu : le bloc JSON-LD de l’accueil est retiré', () => {
  for (const page of PRERENDERED) {
    const html = renderPage(SOURCE, page);
    assert.ok(!html.includes('application/ld+json'), `JSON-LD conservé sur ${page.path}`);
    assert.ok(!html.includes('FAQPage'), `FAQPage conservé sur ${page.path}`);
  }
});

test('pré-rendu : la coquille porte le texte de la page et lie les autres', () => {
  for (const page of PRERENDERED) {
    const html = renderPage(SOURCE, page);
    const shell = html.match(/<main id="seo-shell"[\s\S]*?<\/main>/);
    assert.ok(shell, `coquille absente de ${page.path}`);

    assert.ok(shell[0].includes(escapeHtml(page.heading)), `titre h1 absent de ${page.path}`);
    assert.ok(shell[0].includes(escapeHtml(page.intro.slice(0, 60))), `intro absente de ${page.path}`);
    assert.ok(!shell[0].includes(`href="${page.path}"`), `${page.path} se lie à elle-même`);

    for (const other of PAGES) {
      if (other.path === page.path) continue;
      assert.ok(shell[0].includes(`href="${other.path}"`), `${page.path} ne lie pas ${other.path}`);
    }
  }
});

// Le bundle et la feuille de style injectés par Vite doivent survivre à la
// dérivation : sans eux, la page est un cul-de-sac statique.
test('pré-rendu : le point d’entrée du bundle est conservé', () => {
  const html = renderPage(SOURCE, PRERENDERED[0]);
  assert.ok(html.includes('<script type="module"'), 'script du bundle perdu');
  assert.ok(html.includes('id="root"'), 'conteneur #root perdu');
  assert.match(html, /<html lang="fr">/, 'langue du document perdue');
});

test('pré-rendu : une balise manquante casse le build plutôt que de livrer un doublon', () => {
  assert.throws(
    () => renderPage('<!doctype html><html><head></head><body></body></html>', PRERENDERED[0]),
    /motif introuvable/,
  );
});

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

