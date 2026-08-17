'use strict';

/* ==========================================================================
 * Génère `frontend/src/lib/cities-seo.ts` depuis `server/city-pages.js`.
 *
 * Pourquoi un fichier généré et versionné, plutôt qu'un appel réseau :
 *
 *  - la donnée vient de `server/data/cities.json`, 37 756 communes, que le
 *    client n'embarque évidemment pas ;
 *  - un `fetch('/api/city/nancy')` serait bloqué chez les moteurs de recherche —
 *    `robots.txt` interdit `/api/`. La page rendue serait alors plus pauvre que
 *    son HTML pré-rendu, ce qui est exactement le contraire du but ;
 *  - un `<script type="application/json">` embarqué dans le HTML exigerait un
 *    hash CSP par page (cf. `server/security.js`).
 *
 * Reste le fichier généré : même convention que `cities.json` lui-même
 * (`npm run build:geo`) — donnée dérivée, écrite par un script, relue par un
 * test. `test/city-pages.test.js` échoue si ce fichier ne correspond plus à la
 * sélection, donc un oubli de régénération casse la suite, pas la production.
 *
 * Usage : `npm run build:seo-cities` (à la racine).
 * ======================================================================== */

const fs = require('fs');
const path = require('path');

const { cityPages, detail } = require('../server/city-pages');

const TARGET = path.join(__dirname, '..', 'frontend', 'src', 'lib', 'cities-seo.ts');

const HEADER = `/* ==========================================================================
 * Villes ayant leur propre page (\`/tchat/nancy\`) — FICHIER GÉNÉRÉ.
 *
 * Écrit par \`scripts/build-seo-cities.js\` depuis \`server/city-pages.js\`, qui
 * dérive tout de la base géographique embarquée. Ne pas modifier à la main : la
 * prochaine régénération écraserait la retouche, et \`test/city-pages.test.js\`
 * refuserait déjà le décalage.
 *
 * Pour changer la sélection (seuil de population, villes hors de France),
 * modifier \`server/city-pages.js\` puis lancer \`npm run build:seo-cities\`.
 * ======================================================================== */

/** Une commune à portée : nom, distance en km, et son slug si elle a sa page. */
export type NearbyCity = { name: string; km: number; slug: string | null };

export type SeoCity = {
  slug: string;
  /** Identifiant stable de la commune (\`FR-54395\`), tel que l'attend \`identify\`. */
  id: string;
  name: string;
  /** Titre et description de la page, tels que pré-rendus — repris par lib/head.ts
      quand la navigation client arrive sur la page sans rechargement. */
  title: string;
  description: string;
  /** Département, province ou canton — absent pour Monaco et le Luxembourg. */
  subdivision: string | null;
  country: string;
  population: number;
  /** Nombre total de communes dans le rayon du service, pas seulement celles listées. */
  nearbyTotal: number;
  nearby: NearbyCity[];
};

export const SEO_CITIES: SeoCity[] = `;

const FOOTER = `
export const CITY_BY_SLUG: Map<string, SeoCity> = new Map(SEO_CITIES.map((c) => [c.slug, c]));

/** \`/tchat/nancy\` -> la ville, ou null : sert de garde de routage côté client. */
export function cityFromPath(pathname: string): SeoCity | null {
  const match = /^\\/tchat\\/([a-z0-9-]+)$/.exec(pathname.replace(/\\/+$/, ''));
  return match ? CITY_BY_SLUG.get(match[1]) ?? null : null;
}
`;

function main() {
  const data = cityPages().map((page) => {
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

  fs.writeFileSync(TARGET, HEADER + JSON.stringify(data, null, 2) + ';\n' + FOOTER, 'utf8');

  const kb = Math.round(fs.statSync(TARGET).size / 102.4) / 10;
  console.log(`[seo-cities] ${data.length} villes → frontend/src/lib/cities-seo.ts (${kb} Ko)`);
}

if (require.main === module) main();

module.exports = { TARGET };
