'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Injecte le fake Redis avant de charger security (qui require ./redis).
require('./helpers/inject-redis');
const security = require('../server/security');

const ROOT = path.join(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'frontend', 'index.html');
const ROBOTS = path.join(ROOT, 'frontend', 'public', 'robots.txt');
const PAGES_JS = path.join(ROOT, 'server', 'pages.js');
const { sitemap } = require('../scripts/prerender-routes');

/** Contenu brut du bloc <script type="application/ld+json"> de frontend/index.html. */
function jsonLdContent() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'bloc <script type="application/ld+json"> introuvable dans frontend/index.html');
  return m[1];
}

/** En-tête Content-Security-Policy réellement émis par le middleware. */
function cspHeader() {
  const headers = {};
  security.securityHeaders({}, { setHeader: (k, v) => (headers[k] = v) }, () => {});
  return headers['Content-Security-Policy'];
}

// Le hash CSP porte sur les octets EXACTS du contenu de la balise. Un saut de ligne
// rendrait le hash dépendant de la plateforme (CRLF en dev Windows, LF sur la VM
// Linux après rsync) : on impose donc le contenu sur une seule ligne.
test('JSON-LD : contenu sur une seule ligne (hash insensible aux fins de ligne)', () => {
  assert.ok(
    !/[\r\n]/.test(jsonLdContent()),
    'le bloc JSON-LD doit tenir sur une seule ligne, sans indentation avant </script>',
  );
});

test('JSON-LD : bloc syntaxiquement valide', () => {
  const data = JSON.parse(jsonLdContent());
  assert.equal(data['@context'], 'https://schema.org');
  assert.ok(Array.isArray(data['@graph']) && data['@graph'].length > 0);
});

// Régression : le commit 9b6a844 avait modifié ce bloc (favicon.svg -> logo.png)
// sans recalculer le hash de la CSP. Ce test échoue désormais si l'un bouge sans l'autre.
test("CSP : le hash script-src correspond au bloc JSON-LD d'index.html", () => {
  const expected = crypto.createHash('sha256').update(jsonLdContent(), 'utf8').digest('base64');
  const csp = cspHeader();
  const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src'));
  assert.ok(scriptSrc, 'directive script-src absente de la CSP');
  assert.ok(
    scriptSrc.includes(`'sha256-${expected}'`),
    `hash obsolète dans server/security.js.\n  attendu : 'sha256-${expected}'\n  trouvé  : ${scriptSrc.trim()}`,
  );
});

test('JSON-LD : décrit le site, l\'organisation, l\'application et la FAQ', () => {
  const types = new Set(JSON.parse(jsonLdContent())['@graph'].map((node) => node['@type']));
  for (const expected of ['WebSite', 'Organization', 'WebApplication', 'FAQPage']) {
    assert.ok(types.has(expected), `entité ${expected} absente du @graph`);
  }
});

/** Texte brut d'index.html, espaces normalisés (les &nbsp; deviennent des espaces). */
function indexText() {
  return fs
    .readFileSync(INDEX_HTML, 'utf8')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

// Google exige que le contenu déclaré en FAQPage soit RÉELLEMENT visible sur la
// page ; une FAQ structurée qui n'existe que dans le JSON-LD est une violation
// des règles sur les données structurées (risque de sanction manuelle).
test('SEO : chaque question du FAQPage figure aussi dans le HTML de la page', () => {
  const html = indexText();
  const faq = JSON.parse(jsonLdContent())['@graph'].find((node) => node['@type'] === 'FAQPage');
  assert.ok(faq, 'entité FAQPage absente');

  for (const question of faq.mainEntity) {
    const needle = question.name.replace(/\s+/g, ' ');
    assert.ok(html.includes(needle), `question absente du HTML visible : « ${question.name} »`);
  }
});

// Garde-fou de performance : logo.png pèse ~300 Ko. Déclaré en <link rel="icon">,
// certains navigateurs le choisissent (c'est la plus grande taille annoncée) et
// le téléchargent à chaque visite pour un onglet de 16 px. Il reste légitime
// dans le JSON-LD Organization et le manifeste — mais pas comme favicon.
test('SEO : aucune icône de page ne pointe sur le logo pleine résolution', () => {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  for (const tag of html.match(/<link[^>]+rel="(?:icon|apple-touch-icon)"[^>]*>/g) || []) {
    assert.ok(!/logo\.png/.test(tag), `icône trop lourde déclarée : ${tag}`);
  }
});

test('SEO : les chemins non publics sont marqués hors indexation', () => {
  for (const url of ['/api/cities?q=lux', '/operator', '/operator/app.js', '/socket.io/socket.io.js']) {
    assert.ok(security.isUnindexable({ originalUrl: url }), `${url} devrait être noindex`);
  }
  // Les liens d'invitation mènent à des salons privés : jamais dans un index.
  assert.ok(security.isUnindexable({ originalUrl: '/?r=abc123&k=secret' }), 'lien d’invitation indexable');
  // La vitrine, elle, doit rester indexable.
  for (const url of ['/', '/?utm_source=newsletter', '/index.html']) {
    assert.ok(!security.isUnindexable({ originalUrl: url }), `${url} ne devrait pas être noindex`);
  }
});

test('SEO : X-Robots-Tag effectivement émis pour les chemins non publics', () => {
  const headersFor = (url) => {
    const headers = {};
    security.securityHeaders({ originalUrl: url }, { setHeader: (k, v) => (headers[k] = v) }, () => {});
    return headers;
  };
  assert.equal(headersFor('/api/health')['X-Robots-Tag'], 'noindex, nofollow');
  assert.equal(headersFor('/')['X-Robots-Tag'], undefined);
});

// Hôtes tiers légitimement cités dans les métadonnées (vocabulaires, pas des URLs du service).
const EXTERNAL_HOSTS = new Set(['schema.org', 'www.sitemaps.org', 'www.w3.org', 'ogp.me']);

// Garde-fou de bascule de domaine : index.html, robots.txt, sitemap.xml et la
// déclaration des pages doivent désigner une seule et même origine publique.
// Évite une migration à moitié faite (canonical sur un domaine, sitemap sur
// l'ancien).
test('SEO : une seule origine publique dans index.html, robots.txt, sitemap.xml et pages.js', () => {
  const hosts = new Set();
  // Le sitemap est désormais produit au build (`scripts/prerender-routes.js`) :
  // on inspecte sa sortie, pas un fichier — il n'en existe plus dans le dépôt.
  const sources = [INDEX_HTML, ROBOTS, PAGES_JS].map((file) => fs.readFileSync(file, 'utf8'));
  sources.push(sitemap('2026-01-01'));

  for (const text of sources) {
    for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
      const host = m[1].toLowerCase();
      if (!EXTERNAL_HOSTS.has(host)) hosts.add(host);
    }
  }
  assert.equal(
    hosts.size,
    1,
    `une seule origine publique attendue, trouvé : ${[...hosts].sort().join(', ')}`,
  );
});
