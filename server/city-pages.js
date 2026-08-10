'use strict';

/* ==========================================================================
 * Pages par ville (`/tchat/nancy`) — source unique de vérité.
 *
 * « Tchat Nancy », « chat anonyme Lyon » : c'est le plus gros volume de
 * recherche pour un service de proximité, et une page d'accueil unique ne peut
 * pas se classer dessus. Le risque de l'exercice est connu — des pages
 * satellites (« doorway pages ») qui répètent le même texte avec un nom de ville
 * substitué sont explicitement sanctionnées par Google, et le seraient à juste
 * titre : elles n'apprennent rien à personne.
 *
 * Ce qui rend ces pages légitimes ici, c'est que le service possède déjà la
 * donnée qui les distingue : `data/cities.json` porte l'entièreté des communes
 * avec population et coordonnées. Chaque page peut donc dire ce qu'aucune autre
 * ne dit — combien de communes sont réellement à portée depuis cette ville-là,
 * lesquelles, et à quelle distance — calculé avec le même rayon que celui qui
 * régit la présence dans l'application. C'est du contenu propre, vérifiable, et
 * utile avant même d'entrer dans le service.
 *
 * Le corollaire tient en une règle : pas de page pour une ville dont on n'a
 * rien à dire. D'où une sélection étroite et assumée (voir `SELECTION`), et non
 * les 37 756 communes de la base.
 *
 * Le contenu affiché côté client vient de `frontend/src/lib/cities-seo.ts`, que
 * `scripts/build-seo-cities.js` régénère depuis ce fichier (comme `cities.json`
 * est lui-même généré : donnée dérivée, versionnée, jamais écrite à la main).
 * `test/city-pages.test.js` échoue si les deux divergent.
 * ======================================================================== */

const config = require('./config');
const { cities, subs } = require('./data/cities.json');

/** Origine publique — cf. `pages.js`, qui porte la même constante. */
const PREFIX = '/tchat';

/* --------------------------------------------------------------------------
 * Sélection
 *
 * France : une règle, pas une liste — 100 000 habitants, soit 42 communes. Le
 * seuil est un arbitrage entre volume de recherche et matière disponible ; le
 * descendre à 50 000 tripleraît le nombre de pages sans rien ajouter à chacune.
 *
 * Hors de France : une liste nommée, parce que la population de la base y est
 * inégale — Esch-sur-Alzette y figure à 0 habitant, et les communes
 * luxembourgeoises portent parfois le chiffre de leur canton. Un seuil
 * appliqué à ces valeurs sélectionnerait des villages et manquerait des villes.
 * On nomme donc, en restant sur l'aire francophone : le service est en français,
 * une page « tchat Winterthour » ne rendrait service à personne.
 * ------------------------------------------------------------------------ */

const FR_MIN_POPULATION = 100000;

const ABROAD = [
  // Belgique — Bruxelles et la Wallonie. Les autres communes bruxelloises
  // (Schaerbeek, Ixelles…) sont à moins de 5 km : elles partagent la même
  // liste de voisines, donc la même page. Une seule suffit.
  { country: 'BE', name: 'Bruxelles' },
  { country: 'BE', name: 'Charleroi' },
  { country: 'BE', name: 'Liège' },
  { country: 'BE', name: 'Namur' },
  { country: 'BE', name: 'Mons' },
  { country: 'BE', name: 'La Louvière' },
  { country: 'BE', name: 'Tournai' },
  { country: 'BE', name: 'Seraing' },
  { country: 'BE', name: 'Verviers' },
  { country: 'BE', name: 'Mouscron' },
  // Suisse romande.
  { country: 'CH', name: 'Genève' },
  { country: 'CH', name: 'Lausanne' },
  { country: 'CH', name: 'Sion' },
  { country: 'CH', name: 'Fribourg' },
  { country: 'CH', name: 'Neuchâtel' },
  { country: 'CH', name: 'La Chaux-de-Fonds' },
  { country: 'CH', name: 'Yverdon-les-Bains' },
  { country: 'CH', name: 'Montreux' },
  { country: 'CH', name: 'Nyon' },
  { country: 'CH', name: 'Martigny' },
  { country: 'CH', name: 'Vevey' },
  { country: 'CH', name: 'Delémont' },
  // Luxembourg et Monaco.
  { country: 'LU', name: 'Ville de Luxembourg', display: 'Luxembourg' },
  { country: 'LU', name: 'Esch-sur-Alzette' },
  { country: 'MC', name: 'Monaco' },
];

/** Cantons suisses : `subs` ne couvre que la France, la Belgique et Monaco. */
const CANTONS = {
  GE: 'canton de Genève',
  VD: 'canton de Vaud',
  VS: 'canton du Valais',
  NE: 'canton de Neuchâtel',
  FR: 'canton de Fribourg',
  JU: 'canton du Jura',
};

const COUNTRIES = { FR: 'France', BE: 'Belgique', CH: 'Suisse', LU: 'Luxembourg', MC: 'Monaco' };

/* --------------------------------------------------------------------------
 * Outils
 * ------------------------------------------------------------------------ */

/**
 * Slug d'URL : minuscules, sans accent ni caractère composé.
 *
 * Les ligatures sont traitées avant la décomposition Unicode : `œ` n'est pas un
 * `o` accentué mais un caractère à part entière, que NFD laisse intact — sans
 * cette ligne, Vandœuvre-lès-Nancy deviendrait `vand-uvre-les-nancy`.
 */
function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Distance orthodromique en kilomètres. Le service raisonne en rayon de 75 km ;
 * à cette échelle la formule de haversine sur une sphère de 6371 km est exacte
 * à quelques dizaines de mètres — largement en deçà de ce qu'une page affiche.
 */
function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Libellé de la subdivision : département, province, canton — selon le pays.
 *
 * Null quand la subdivision porte le nom de la ville : « Paris (Paris) » et
 * « Monaco (Monaco) » n'apprennent rien, et c'est le cas de tous les
 * départements-villes.
 */
function subdivision(city) {
  const label = city.c === 'CH' ? CANTONS[city.r] : subs[`${city.c}|${city.d}`];
  if (!label || label === city.n) return null;
  if (city.c === 'BE') return `province de ${label}`;
  return label;
}

/* --------------------------------------------------------------------------
 * Construction des descripteurs
 * ------------------------------------------------------------------------ */

/** Communes retenues, dans l'ordre de population décroissante. */
function select() {
  const byName = new Map();
  for (const city of cities) {
    const key = `${city.c}|${city.n}`;
    // Homonymes : la base est triée par population, la première gagne.
    if (!byName.has(key)) byName.set(key, city);
  }

  const chosen = [];
  const missing = [];

  for (const city of cities) {
    if (city.c === 'FR' && city.p >= FR_MIN_POPULATION) chosen.push({ city });
  }

  for (const entry of ABROAD) {
    const city = byName.get(`${entry.country}|${entry.name}`);
    if (!city) {
      missing.push(`${entry.country}|${entry.name}`);
      continue;
    }
    chosen.push({ city, display: entry.display });
  }

  // La base géographique est régénérable (`npm run build:geo`) : un nom qui
  // change ne doit pas empêcher le serveur de démarrer. On l'annonce et on
  // continue sans la page — `test/city-pages.test.js` échoue, lui.
  if (missing.length > 0) {
    console.warn(`[city-pages] communes introuvables dans la base : ${missing.join(', ')}`);
  }

  chosen.sort((a, b) => b.city.p - a.city.p);
  return chosen;
}

/**
 * Noms d'affichage. Deux communes homonymes ne peuvent pas partager une URL, et
 * « Saint-Denis » en désigne bien deux dans la sélection (Seine-Saint-Denis et
 * La Réunion). Le nom seul ne désignant alors aucun lieu, on le qualifie — pour
 * l'URL comme pour l'humain qui lit le titre.
 */
function withNames(chosen) {
  const counts = new Map();
  for (const { city, display } of chosen) {
    const name = display || city.n;
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  return chosen.map(({ city, display }) => {
    const base = display || city.n;
    const ambiguous = counts.get(base) > 1;
    const name = ambiguous && city.d ? `${base} (${city.d})` : base;
    const slug = ambiguous && city.d ? `${slugify(base)}-${city.d}` : slugify(base);
    return { city, name, slug };
  });
}

/**
 * Communes réellement à portée depuis une ville, avec leur distance.
 *
 * Le seuil de population filtre le bruit plutôt que la vérité : autour de Paris,
 * les dix plus proches communes sont dix villes de banlieue à trois kilomètres,
 * ce qui n'apprend rien sur la portée réelle. On privilégie donc les communes
 * qu'un lecteur reconnaît, et on retombe sur les plus proches quand la région
 * est peu dense — une page ne doit jamais se retrouver sans liste.
 */
const NEARBY_SHOWN = 10;
const NEARBY_MIN_POPULATION = 15000;

function nearbyOf(target) {
  const inRadius = [];
  for (const city of cities) {
    if (city.i === target.i) continue;
    const km = distanceKm(target, city);
    if (km <= config.radiusKm) inRadius.push({ city, km });
  }
  inRadius.sort((a, b) => a.km - b.km);

  const notable = inRadius.filter((entry) => entry.city.p >= NEARBY_MIN_POPULATION);
  const shown = (notable.length >= 6 ? notable : inRadius).slice(0, NEARBY_SHOWN);

  return { total: inRadius.length, shown };
}

/**
 * Descripteur complet d'une ville : ce que le pré-rendu écrit en HTML et ce que
 * le client affiche. Le calcul balaie la base entière par ville — 37 756
 * distances — donc il n'est fait qu'à la demande, par les scripts de build, et
 * jamais au démarrage du serveur.
 */
function detail(slug) {
  const entry = ROUTE_BY_SLUG.get(slug);
  if (!entry) return null;

  const { city, name } = entry;
  const { total, shown } = nearbyOf(city);
  const slugOf = new Map(SELECTED.map((e) => [e.city.i, e.slug]));

  return {
    slug,
    path: entry.path,
    name,
    // Même forme que les suggestions d'autocomplétion (`domain/cities.js`) : la
    // page pré-remplit le formulaire d'entrée, et c'est l'identifiant — jamais le
    // nom — qui désigne une commune sans ambiguïté (3 675 homonymes en France).
    id: `${city.c}-${city.i}`,
    country: COUNTRIES[city.c] || city.c,
    subdivision: subdivision(city),
    population: city.p,
    nearbyTotal: total,
    nearby: shown.map(({ city: near, km }) => ({
      name: near.n,
      km: km < 10 ? Math.round(km * 10) / 10 : Math.round(km),
      // Une voisine n'est un lien que si elle a sa propre page : mieux vaut un
      // nom en texte qu'un lien vers une page qui n'existe pas.
      slug: slugOf.get(near.i) || null,
    })),
  };
}

/* --------------------------------------------------------------------------
 * Descripteurs de page
 * ------------------------------------------------------------------------ */

/**
 * Métadonnées d'une page de ville. Titre et description doivent être uniques
 * d'une ville à l'autre — servir le même couple sous 67 URLs les ferait
 * regrouper en une seule par les moteurs, exactement ce qu'on cherche à éviter
 * (cf. l'en-tête de `pages.js`). Ils le sont par construction : le nom de la
 * ville et ses chiffres y figurent.
 */
function describe(entry, counts) {
  const { name, slug } = entry;
  const sub = subdivision(entry.city);
  const where = sub ? `${name} (${sub})` : name;
  const total = counts.total.toLocaleString('fr-FR');
  // `ceil` et non `round` : « à moins de 3 km » serait faux pour 3,3 km.
  const nearest = Math.max(1, Math.ceil(counts.nearestKm));

  return {
    slug,
    path: `${PREFIX}/${slug}`,
    file: `tchat-${slug}.html`,
    title: `Tchat anonyme à ${name} — Proxima`,
    description:
      `Discutez anonymement avec des personnes de ${name} et des environs : ` +
      `${total} communes à portée dans un rayon de ${config.radiusKm} km. ` +
      `Sans inscription, sans trace.`,
    heading: `Tchat anonyme à ${name}`,
    intro:
      `Parlez aux gens de ${where} et des communes voisines, sans créer de compte et sans laisser de trace. ` +
      `Depuis ${name}, Proxima vous relie aux personnes présentes dans un rayon de ${config.radiusKm} km, ` +
      `soit ${total} communes — la plus proche à moins de ${nearest} km. ` +
      `Vos messages sont chiffrés de bout en bout, et tout disparaît à la fermeture de l'onglet.`,
    nav: name,
  };
}

const SELECTED = withNames(select());

/**
 * Routes des pages de ville : ce dont le serveur a besoin, et rien de plus.
 *
 * Calculer ici les compteurs des métadonnées coûterait un balayage complet de la
 * base par ville — 2,5 millions de distances, six dixièmes de seconde ajoutés à
 * chaque démarrage du serveur, pour une donnée qu'il n'utilise pas : il ne sert
 * que des fichiers déjà pré-rendus. Les métadonnées sont donc calculées à la
 * demande par `cityPages()`, qu'appellent les scripts de build et les tests.
 */
const CITY_ROUTES = SELECTED.map(({ city, name, slug }) => ({
  slug,
  name,
  city,
  path: `${PREFIX}/${slug}`,
  file: `tchat-${slug}.html`,
}));

const ROUTE_BY_SLUG = new Map(CITY_ROUTES.map((route) => [route.slug, route]));

/** Table chemin -> fichier, pour la négociation de contenu du serveur. */
const CITY_FILE_BY_PATH = new Map(CITY_ROUTES.map((route) => [route.path, route.file]));

/** `/tchat/nancy` -> `nancy`, ou null si le chemin n'est pas celui d'une ville. */
function slugFromPath(pathname) {
  const match = /^\/tchat\/([a-z0-9-]+)$/.exec(String(pathname).replace(/\/+$/, ''));
  return match && ROUTE_BY_SLUG.has(match[1]) ? match[1] : null;
}

/** Descripteurs complets (titre, description, intro), calculés une seule fois. */
let pagesCache = null;
function cityPages() {
  if (pagesCache) return pagesCache;
  pagesCache = SELECTED.map((entry) => {
    const { total, shown } = nearbyOf(entry.city);
    const nearestKm = shown.length > 0 ? shown[0].km : config.radiusKm;
    return { ...describe(entry, { total, nearestKm }), name: entry.name };
  });
  return pagesCache;
}

module.exports = {
  PREFIX,
  CITY_ROUTES,
  CITY_FILE_BY_PATH,
  cityPages,
  slugFromPath,
  detail,
  slugify,
  distanceKm,
};
