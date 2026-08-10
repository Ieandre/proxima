'use strict';

/* ==========================================================================
 * Pré-rendu des pages publiques (SEO).
 *
 * Vite ne produit qu'un `index.html`. Ce script en dérive un fichier par page
 * déclarée dans `server/pages.js`, avec ses propres titre, description, URL
 * canonique et coquille statique.
 *
 * Pourquoi au build, et pourquoi pas simplement servir index.html sous six
 * URLs : six documents identiques ne sont pas six pages pour un moteur, mais
 * six doublons regroupés sous une seule URL — l'exercice serait vain. Ce qui
 * fait exister une page, c'est un titre, une description et un texte qui lui
 * sont propres.
 *
 * Pourquoi une coquille statique plutôt qu'un rendu React côté serveur : le
 * contenu complet de ces pages vit dans des composants qui dépendent du
 * navigateur (libsodium, `window`). Un vrai SSR serait un chantier sans rapport
 * avec le gain visé — les moteurs exécutent le bundle et voient le texte entier.
 * La coquille couvre les deux cas où il ne s'exécute pas : le premier passage de
 * l'explorateur, et les visiteurs sans JavaScript (réglage « Safest » de Tor).
 *
 * Le bloc JSON-LD de l'accueil est retiré des pages dérivées, pour deux raisons
 * qui vont dans le même sens : son entité `FAQPage` doit correspondre à une FAQ
 * réellement visible sur la page qui la porte (règle Google sur les données
 * structurées, vérifiée par `test/csp-jsonld.test.js`), et tout bloc `<script>`
 * exige son propre hash SHA-256 dans la CSP. Pas de bloc, ni l'un ni l'autre
 * problème.
 * ======================================================================== */

const fs = require('fs');
const path = require('path');

const { ORIGIN, PAGES, PRERENDERED } = require('../server/pages');
const { cityPages, detail } = require('../server/city-pages');

const DIST = path.join(__dirname, '..', 'frontend', 'dist');

/** Échappement des caractères qui ont un sens en HTML, pour le texte injecté. */
function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Remplace une balise, en exigeant qu'elle existe : une substitution silencieuse
 * qui échoue livrerait la page avec les métadonnées de l'accueil, c'est-à-dire
 * précisément le doublon qu'on cherche à éviter. Mieux vaut casser le build.
 *
 * Le motif tolère les retours à la ligne : `index.html` répartit certaines
 * balises sur plusieurs lignes, et Vite les recopie telles quelles.
 */
function replaceOnce(html, pattern, replacement, label) {
  if (!pattern.test(html)) {
    throw new Error(`[prerender] motif introuvable dans index.html : ${label}`);
  }
  return html.replace(pattern, () => replacement);
}

/** Remplace le `content` d'une balise meta désignée par `name=` ou `property=`. */
function setMeta(html, attr, key, value) {
  return replaceOnce(
    html,
    new RegExp(`<meta\\s+${attr}="${key}"[\\s\\S]*?/?>`, 'i'),
    `<meta ${attr}="${key}" content="${esc(value)}" />`,
    `<meta ${attr}="${key}">`,
  );
}

/**
 * Coquille statique de la page : le texte réel servi en HTML brut. Elle reprend
 * le vocabulaire de styles inline d'`index.html` — la CSP autorise `style-src
 * 'unsafe-inline'` mais aucun script, et cette coquille ne doit dépendre ni de
 * Tailwind ni du bundle pour être lisible.
 *
 * La navigation entre pages n'est pas décorative : ce sont les seuls liens par
 * lesquels un explorateur peut découvrir les autres URLs sans exécuter le
 * bundle. Elle pointe vers toutes les pages sauf celle qu'on lit.
 */
function shell(page) {
  const links = PAGES.filter((p) => p.path !== page.path)
    .map((p) => `<a href="${p.path}" style="color:#5b6676">${esc(p.nav)}</a>`)
    .join(' · ');

  return (
    `<main id="seo-shell" style="max-width:680px;margin:0 auto;padding:56px 24px;` +
    `font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1a2230;line-height:1.6">` +
    `<header style="display:flex;align-items:center;gap:12px;margin-bottom:40px">` +
    `<span style="display:inline-grid;place-items:center;width:40px;height:40px;border-radius:14px;` +
    `background:#0f6fdb;color:#fff;font-size:20px">◈</span>` +
    `<span><strong style="display:block;font-size:19px;letter-spacing:-.02em">Proxima</strong>` +
    `<small style="color:#5b6676;font-size:12px">Anonyme · Chiffré · Éphémère</small></span>` +
    `</header>` +
    `<h1 style="font-size:2rem;line-height:1.15;font-weight:600;margin:0 0 16px">${esc(page.heading)}</h1>` +
    `<p style="font-size:1.05rem;color:#3c4859;max-width:60ch">${esc(page.intro)}</p>` +
    `<noscript><p style="margin:32px 0 0;padding:14px 16px;border:1px solid #d6dde8;border-radius:12px;` +
    `background:#f4f7fb;color:#3c4859;font-size:.95rem">` +
    `<strong>Le texte complet de cette page nécessite JavaScript.</strong> Le service lui-même s'exécute dans ` +
    `votre navigateur — c'est ce qui permet de chiffrer les messages privés sur votre appareil. Sous Tor Browser, ` +
    `le niveau «&nbsp;Safest&nbsp;» désactive JavaScript&nbsp;: passez en «&nbsp;Safer&nbsp;» pour tout consulter.` +
    `</p></noscript>` +
    `<p style="margin-top:40px">` +
    `<a href="/" style="display:inline-block;background:#0f6fdb;color:#fff;text-decoration:none;` +
    `padding:12px 22px;border-radius:999px;font-weight:600">Entrer dans le service</a></p>` +
    `<footer style="margin-top:48px;padding-top:20px;border-top:1px solid #e2e6ec;font-size:12px;color:#5b6676">` +
    `${links}</footer>` +
    `</main>`
  );
}

/**
 * Coquille d'une page de ville. Elle porte la donnée qui distingue la page :
 * les communes réellement à portée et leur distance. C'est ce qui sépare une
 * page locale utile d'une page satellite — et comme le bundle affiche la même
 * liste, ce que voit un moteur avant et après exécution du JavaScript concorde.
 *
 * Les voisines qui ont leur propre page sont liées : c'est par ces liens que le
 * maillage local existe, et le seul chemin par lequel un explorateur atteint
 * une page de ville sans passer par le sommaire.
 */
function cityShell(page, city) {
  // Virgule décimale : la donnée reste un nombre, seul l'affichage est français.
  const km = (value) => String(value).replace('.', ',');

  const links = city.nearby
    .map((near) =>
      near.slug
        ? `<a href="/tchat/${near.slug}" style="color:#0f6fdb">${esc(near.name)}</a> ` +
          `<span style="color:#5b6676">${km(near.km)}&nbsp;km</span>`
        : `${esc(near.name)} <span style="color:#5b6676">${km(near.km)}&nbsp;km</span>`,
    )
    .join(' · ');

  const situation = [city.subdivision, city.country].filter(Boolean).join(', ');

  return (
    `<main id="seo-shell" style="max-width:680px;margin:0 auto;padding:56px 24px;` +
    `font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1a2230;line-height:1.6">` +
    `<header style="display:flex;align-items:center;gap:12px;margin-bottom:40px">` +
    `<span style="display:inline-grid;place-items:center;width:40px;height:40px;border-radius:14px;` +
    `background:#0f6fdb;color:#fff;font-size:20px">◈</span>` +
    `<span><strong style="display:block;font-size:19px;letter-spacing:-.02em">Proxima</strong>` +
    `<small style="color:#5b6676;font-size:12px">Anonyme · Chiffré · Éphémère</small></span>` +
    `</header>` +
    `<h1 style="font-size:2rem;line-height:1.15;font-weight:600;margin:0 0 16px">${esc(page.heading)}</h1>` +
    `<p style="font-size:1.05rem;color:#3c4859;max-width:60ch">${esc(page.intro)}</p>` +
    `<h2 style="font-size:1.2rem;font-weight:600;margin:40px 0 12px">` +
    `Ce qui est à portée depuis ${esc(city.name)}</h2>` +
    `<p style="color:#3c4859">${esc(city.name)}${situation ? ` (${esc(situation)})` : ''} compte ` +
    `${city.population.toLocaleString('fr-FR')} habitants. Dans un rayon de 75 km, ` +
    `<strong>${city.nearbyTotal.toLocaleString('fr-FR')} communes</strong> sont à portée du service, dont&nbsp;:</p>` +
    `<p style="color:#1a2230;margin-top:10px">${links}</p>` +
    `<p style="margin-top:40px">` +
    `<a href="/" style="display:inline-block;background:#0f6fdb;color:#fff;text-decoration:none;` +
    `padding:12px 22px;border-radius:999px;font-weight:600">Entrer et discuter</a></p>` +
    `<footer style="margin-top:48px;padding-top:20px;border-top:1px solid #e2e6ec;font-size:12px;color:#5b6676">` +
    `<a href="/villes" style="color:#5b6676">Toutes les villes</a> · ` +
    `<a href="/chat-anonyme" style="color:#5b6676">Chat anonyme</a> · ` +
    `<a href="/en-savoir-plus" style="color:#5b6676">Comment ça marche</a> · ` +
    `<a href="/cgu" style="color:#5b6676">Conditions d'utilisation</a> · ` +
    `<a href="/confidentialite" style="color:#5b6676">Confidentialité</a>` +
    `</footer></main>`
  );
}

/**
 * Dérive le HTML d'une page à partir de celui de l'accueil.
 * Fonction pure — `test/pages.test.js` l'exerce sur `frontend/index.html`.
 *
 * `shellFor` permet aux pages de ville de substituer leur propre coquille sans
 * dupliquer toute la mécanique de métadonnées, qui est la même pour elles.
 */
function renderPage(indexHtml, page, shellFor = shell) {
  const url = `${ORIGIN}${page.path}`;
  let html = indexHtml;

  html = replaceOnce(html, /<title>[\s\S]*?<\/title>/i, `<title>${esc(page.title)}</title>`, '<title>');
  html = setMeta(html, 'name', 'description', page.description);
  html = replaceOnce(
    html,
    /<link\s+rel="canonical"[\s\S]*?\/?>/i,
    `<link rel="canonical" href="${url}" />`,
    '<link rel="canonical">',
  );

  html = setMeta(html, 'property', 'og:url', url);
  html = setMeta(html, 'property', 'og:title', page.title);
  html = setMeta(html, 'property', 'og:description', page.description);
  html = setMeta(html, 'name', 'twitter:title', page.title);
  html = setMeta(html, 'name', 'twitter:description', page.description);

  // Cf. en-tête : ni FAQPage sans FAQ visible, ni hash CSP supplémentaire.
  html = replaceOnce(
    html,
    /<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/i,
    '',
    'bloc JSON-LD',
  );

  html = replaceOnce(html, /<main id="seo-shell"[\s\S]*?<\/main>/i, shellFor(page), 'coquille #seo-shell');

  return html;
}

/**
 * `sitemap.xml`, dérivé des deux déclarations de pages.
 *
 * Généré et non écrit à la main : avec 67 pages de ville, une liste manuelle
 * divergerait au premier changement de seuil de population, et un sitemap qui
 * annonce des URLs mortes est pire que pas de sitemap.
 *
 * `priority` n'est plus lu par Google depuis des années ; on le conserve pour
 * les autres moteurs, qui s'en servent encore.
 */
function sitemap(today) {
  const entries = [
    ...PAGES.map((page) => ({
      loc: page.path === '/' ? `${ORIGIN}/` : `${ORIGIN}${page.path}`,
      changefreq: page.path === '/' ? 'daily' : 'monthly',
      priority: page.path === '/' ? '1.0' : '0.7',
    })),
    ...cityPages().map((page) => ({
      loc: `${ORIGIN}${page.path}`,
      changefreq: 'monthly',
      priority: '0.6',
    })),
  ];

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!-- Généré par scripts/prerender-routes.js — ne pas modifier à la main. -->\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries
      .map(
        (e) =>
          `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${today}</lastmod>\n` +
          `    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>\n`,
      )
      .join('') +
    '</urlset>\n'
  );
}

function main() {
  const indexHtml = path.join(DIST, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    console.error(`[prerender] ${indexHtml} introuvable — lancez le build avant.`);
    process.exitCode = 1;
    return;
  }

  const source = fs.readFileSync(indexHtml, 'utf8');
  for (const page of PRERENDERED) {
    fs.writeFileSync(path.join(DIST, page.file), renderPage(source, page), 'utf8');
  }

  const cities = cityPages();
  for (const page of cities) {
    const city = detail(page.slug);
    fs.writeFileSync(
      path.join(DIST, page.file),
      renderPage(source, page, (p) => cityShell(p, city)),
      'utf8',
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap(today), 'utf8');

  console.log(
    `[prerender] ${PRERENDERED.length} pages + ${cities.length} villes, ` +
      `sitemap de ${PAGES.length + cities.length} URLs`,
  );
}

if (require.main === module) main();

module.exports = { renderPage, shell, cityShell, sitemap };
