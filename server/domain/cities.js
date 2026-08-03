'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Géocodage hors-ligne via une base de communes embarquée — **l'entièreté des
 * communes** de France, Belgique, Suisse, Luxembourg et Monaco (37 756), générée
 * par `scripts/build-geo.js`. §4.2 : aucune dépendance à un service externe.
 * On ne manipule jamais de position GPS réelle : seule la commune déclarée est
 * convertie en coordonnées (§2.2).
 *
 * Conséquence de l'exhaustivité : 3 675 communes françaises portent un nom
 * qu'une autre porte aussi. Un nom seul ne désigne donc pas un lieu — d'où
 * l'identifiant stable (`FR-57463`) exposé par l'autocomplétion et attendu par
 * `resolve`, et le libellé de subdivision affiché à côté du nom pour lever le
 * doute à l'œil nu.
 */

const DATA_FILE = path.join(__dirname, '..', 'data', 'cities.json');
const POSTAL_FILE = path.join(__dirname, '..', 'data', 'postal.json');

/**
 * Normalise un libellé : minuscules, sans accents, sans ponctuation parasite.
 * Les abréviations « St »/« Ste » sont développées : elles sont la façon la plus
 * courante d'écrire les ~4 000 communes en Saint(e), et « St-Étienne » ne
 * trouvait rien. Appliquée des deux côtés (index et requête), la table reste
 * cohérente.
 */
function normalize(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques combinants
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\bst\b/g, 'saint')
    .replace(/\bste\b/g, 'sainte');
}

const COUNTRY_LABEL = { FR: 'France', BE: 'Belgique', CH: 'Suisse', LU: 'Luxembourg', MC: 'Monaco' };

/**
 * Libellés lisibles des régions administratives (code GeoNames/INSEE admin1 ->
 * nom), clé `PAYS|CODE`. Sert à nommer le salon de région :
 * le dataset ne fournit qu'un code opaque (« 11 », « ZH »…). Toute région absente
 * de cette table retombe sur « Région de <commune principale> » (cf. regionLabel).
 */
const REGION_LABEL = {
  // France métropolitaine (codes INSEE 2016)
  'FR|11': 'Île-de-France',
  'FR|24': 'Centre-Val de Loire',
  'FR|27': 'Bourgogne-Franche-Comté',
  'FR|28': 'Normandie',
  'FR|32': 'Hauts-de-France',
  'FR|44': 'Grand Est',
  'FR|52': 'Pays de la Loire',
  'FR|53': 'Bretagne',
  'FR|75': 'Nouvelle-Aquitaine',
  'FR|76': 'Occitanie',
  'FR|84': 'Auvergne-Rhône-Alpes',
  'FR|93': "Provence-Alpes-Côte d'Azur",
  'FR|94': 'Corse',
  // France d'outre-mer : régions puis collectivités. Absentes jusqu'ici parce que
  // la base ne descendait pas assez bas pour qu'un seul de ces territoires y figure.
  'FR|01': 'Guadeloupe',
  'FR|02': 'Martinique',
  'FR|03': 'Guyane',
  'FR|04': 'La Réunion',
  'FR|06': 'Mayotte',
  'FR|975': 'Saint-Pierre-et-Miquelon',
  'FR|977': 'Saint-Barthélemy',
  'FR|978': 'Saint-Martin',
  'FR|986': 'Wallis-et-Futuna',
  'FR|987': 'Polynésie française',
  'FR|988': 'Nouvelle-Calédonie',
  // Belgique (régions)
  'BE|BRU': 'Bruxelles-Capitale',
  'BE|VLG': 'Flandre',
  'BE|WAL': 'Wallonie',
  // Suisse (cantons)
  'CH|AG': 'Argovie',
  'CH|AI': 'Appenzell Rhodes-Intérieures',
  'CH|AR': 'Appenzell Rhodes-Extérieures',
  'CH|BE': 'Berne',
  'CH|BL': 'Bâle-Campagne',
  'CH|BS': 'Bâle-Ville',
  'CH|FR': 'Fribourg',
  'CH|GE': 'Genève',
  'CH|GL': 'Glaris',
  'CH|GR': 'Grisons',
  'CH|JU': 'Jura',
  'CH|LU': 'Lucerne',
  'CH|NE': 'Neuchâtel',
  'CH|NW': 'Nidwald',
  'CH|OW': 'Obwald',
  'CH|SG': 'Saint-Gall',
  'CH|SH': 'Schaffhouse',
  'CH|SO': 'Soleure',
  'CH|SZ': 'Schwytz',
  'CH|TG': 'Thurgovie',
  'CH|TI': 'Tessin',
  'CH|UR': 'Uri',
  'CH|VD': 'Vaud',
  'CH|VS': 'Valais',
  'CH|ZG': 'Zoug',
  'CH|ZH': 'Zurich',
  // Luxembourg (cantons)
  'LU|CA': 'Capellen',
  'LU|CL': 'Clervaux',
  'LU|DI': 'Diekirch',
  'LU|EC': 'Echternach',
  'LU|ES': 'Esch-sur-Alzette',
  'LU|GR': 'Grevenmacher',
  'LU|LU': 'Luxembourg',
  'LU|ME': 'Mersch',
  'LU|RD': 'Redange',
  'LU|RM': 'Remich',
  'LU|VD': 'Vianden',
  'LU|WI': 'Wiltz',
  // Monaco
  'MC|00': 'Monaco',
};

let CITIES = [];
let SUBS = {}; // `PAYS|CODE` -> libellé de subdivision (département, province)
const byId = new Map(); // identifiant stable (`FR-57463`) -> commune
const regionTopCity = new Map(); // `PAYS|CODE` -> commune la plus peuplée (repli de libellé)

/**
 * Index de recherche. Balayer les 37 756 communes à chaque frappe coûtait dix
 * fois trop cher : les libellés sont donc rangés une fois pour toutes dans deux
 * tableaux triés, où la recherche par préfixe devient une dichotomie.
 *
 * `NAMES` porte les libellés entiers (nom officiel, alias, variante sans article
 * initial : « le havre » -> « havre ») ; `WORDS` porte chaque mot pris à part,
 * ce qui fait trouver « Aix-en-Provence » en tapant « provence ». Les homonymes
 * partagent une entrée, dont la liste est ordonnée par population décroissante.
 */
let NAMES = [];
let NAME_CITIES = [];
let WORDS = [];
let WORD_CITIES = [];

/**
 * Code postal -> communes de la base, généré par `scripts/build-geo.js`.
 *
 * On connaît souvent son code postal mieux que l'orthographe de sa commune. Pour
 * la France l'index est exact par construction (les codes viennent de la fiche
 * INSEE de chaque commune) ; ailleurs, une localité sans commune homonyme est
 * rattachée à la commune connue la plus proche, en le disant (`via`).
 */
const byPostal = new Map(); // code postal -> [{ city, via }]
let POSTAL_CODES = []; // les mêmes clés, triées : permet la recherche par préfixe

/** Premier rang de `tri` dont la valeur est >= `q` (dichotomie sur tableau trié). */
function lowerBound(tri, q) {
  let lo = 0;
  let hi = tri.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tri[mid] < q) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Construit un index trié à partir d'une table `libellé -> communes`. Les deux
 * tableaux parallèles évitent de dupliquer les chaînes : « saint » n'existe qu'une
 * fois pour les 4 000 communes qui le portent.
 */
function buildIndex(table) {
  const cles = [...table.keys()].sort();
  return [cles, cles.map((k) => table.get(k).sort((a, b) => b.population - a.population))];
}

function load() {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  SUBS = raw.subs || {};
  // Le dataset est trié par population décroissante : le premier insert gagne.
  CITIES = raw.cities.map((r) => {
    const city = {
      id: `${r.c}-${r.i}`,
      name: r.n,
      lat: r.lat,
      lon: r.lon,
      country: r.c,
      countryLabel: COUNTRY_LABEL[r.c] || r.c,
      region: r.r,
      // Subdivision de désambiguïsation : le département en France, la province en
      // Belgique. En Suisse et au Luxembourg le canton *est* la région — le dataset
      // ne répète pas l'information, on retombe donc sur le code de région.
      sub: r.d || r.r,
      population: r.p,
      norm: normalize(r.n),
      alts: (r.alt || []).map(normalize),
    };
    city.admin =
      SUBS[`${city.country}|${city.sub}`] || REGION_LABEL[`${city.country}|${city.region}`] || city.countryLabel;
    return city;
  });

  const noms = new Map();
  const mots = new Map();
  const pousser = (table, cle, city) => {
    if (!cle) return;
    const pour = table.get(cle);
    // Tous les libellés d'une même commune sont poussés d'affilée : comparer au
    // dernier suffit à écarter les doublons (nom et alias partageant un mot).
    if (!pour) table.set(cle, [city]);
    else if (pour[pour.length - 1] !== city) pour.push(city);
  };

  for (const c of CITIES) {
    byId.set(c.id, c);
    for (const libelle of [c.norm, ...c.alts]) {
      pousser(noms, libelle, c);
      // « Le Havre » se cherche aussi par « Havre », « L'Isle-Adam » par « Isle-Adam ».
      const sansArticle = libelle.replace(/^(?:l|le|la|les|d|du|des) /, '');
      if (sansArticle !== libelle) pousser(noms, sansArticle, c);
      for (const mot of libelle.split(' ')) if (mot.length >= 2) pousser(mots, mot, c);
    }
    // Repli de libellé de région : le dataset étant trié par population décroissante,
    // la première commune rencontrée pour un `PAYS|CODE` est la plus peuplée.
    if (c.region) {
      const rk = `${c.country}|${c.region}`;
      if (!regionTopCity.has(rk)) regionTopCity.set(rk, c.name);
    }
  }
  [NAMES, NAME_CITIES] = buildIndex(noms);
  [WORDS, WORD_CITIES] = buildIndex(mots);

  console.log(`[cities] ${CITIES.length} communes chargées depuis la base embarquée`);
  loadPostal();
}

/**
 * Index des codes postaux. Absent ou périmé, on s'en passe : le champ commune
 * continue de fonctionner par nom. L'index désigne les communes par leur rang
 * dans `cities.json` — si le nombre de communes a changé, les rangs ne veulent
 * plus rien dire et il faut relancer `scripts/build-geo.js` (qui écrit les deux
 * fichiers ensemble) plutôt que rattacher les gens à des communes au hasard.
 */
function loadPostal() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(POSTAL_FILE, 'utf-8'));
  } catch {
    console.warn('[cities] postal.json absent — la saisie par code postal est désactivée.');
    return;
  }
  if (data.cities !== CITIES.length) {
    console.warn(
      `[cities] postal.json désynchronisé (${data.cities} communes attendues, ${CITIES.length} chargées) — ` +
        'saisie par code postal désactivée. Relancer scripts/build-geo.js.',
    );
    return;
  }
  for (const [code, entrees] of Object.entries(data.codes || {})) {
    const villes = [];
    for (const [rang, via] of entrees) {
      const city = CITIES[rang];
      if (city) villes.push({ city, via: via || null });
    }
    if (villes.length) byPostal.set(code, villes);
  }
  POSTAL_CODES = [...byPostal.keys()].sort();
  console.log(`[cities] ${byPostal.size} codes postaux indexés`);
}

/** Une requête ne faisant que des chiffres est un code postal, pas un nom de commune. */
const isPostalQuery = (q) => /^\d{2,5}$/.test(q);

/**
 * Profil public d'une commune : ce que l'autocomplétion expose, sans coordonnées.
 * `id` est la clé que le client renvoie à l'identification — le nom ne suffit
 * plus à désigner un lieu. `admin` est le libellé qui lève l'homonymie à l'œil.
 */
function publicCity(c, extra) {
  return {
    id: c.id,
    name: c.name,
    admin: c.admin,
    country: c.country,
    countryLabel: c.countryLabel,
    region: c.region,
    ...extra,
  };
}

/**
 * Communes atteignables par un code postal, exact d'abord puis par préfixe (taper
 * « 5700 » doit déjà proposer quelque chose).
 */
function suggestPostal(q, limit) {
  const out = [];
  const vu = new Set();
  const pousser = (code) => {
    for (const { city, via } of byPostal.get(code) || []) {
      if (vu.has(city.id) || out.length >= limit) continue;
      vu.add(city.id);
      out.push(publicCity(city, { postal: code, ...(via ? { via } : {}) }));
    }
  };
  pousser(q);
  // Préfixes : les codes étant triés, ceux qui commencent par `q` forment un bloc
  // contigu — on saute ce qui précède et l'on s'arrête à la sortie du bloc.
  for (let k = lowerBound(POSTAL_CODES, q); k < POSTAL_CODES.length && out.length < limit; k++) {
    const code = POSTAL_CODES[k];
    if (!code.startsWith(q)) break;
    if (code !== q) pousser(code);
  }
  return out;
}

/** Commune désignée par son identifiant stable (`FR-57463`), ou null. */
function byIdentifier(id) {
  return byId.get(String(id || '').trim()) || null;
}

/** Coordonnées exposées à l'appelant — la forme attendue par `identify`. */
function toGeo(c) {
  return {
    id: c.id,
    name: c.name,
    lat: c.lat,
    lon: c.lon,
    country: c.country,
    countryLabel: c.countryLabel,
    region: c.region,
    admin: c.admin,
  };
}

/**
 * Résout un nom de commune — ou un code postal — en coordonnées. Renvoie null si
 * introuvable. Attention : 3 675 communes françaises partagent leur nom avec une
 * autre, et un nom seul désigne alors **la plus peuplée**. Préférer `resolve`,
 * qui accepte l'identifiant renvoyé par l'autocomplétion.
 */
function geocode(cityName) {
  const q = normalize(cityName);
  const k = lowerBound(NAMES, q);
  const c =
    (NAMES[k] === q ? NAME_CITIES[k][0] : undefined) ||
    (isPostalQuery(q) ? (byPostal.get(q) || [])[0]?.city : undefined);
  return c ? toGeo(c) : null;
}

/**
 * Résout la commune choisie à l'entrée. L'identifiant est la voie fiable ; le nom
 * reste accepté en repli, pour ne pas refuser sans raison compréhensible un
 * client plus ancien ou une valeur collée à la main.
 */
function resolve({ id, name } = {}) {
  const c = byIdentifier(id);
  return c ? toGeo(c) : geocode(name);
}

/**
 * Suggestions d'autocomplétion. Trois qualités de correspondance, dans l'ordre :
 * nom exact, début de nom, début d'un mot du nom (« provence » ->
 * Aix-en-Provence). À qualité égale, la commune la plus peuplée passe devant.
 */
function suggest(query, limit = 10) {
  const q = normalize(query);
  if (q.length < 2) return [];
  if (isPostalQuery(q)) return suggestPostal(q, limit);

  const vu = new Set();
  const out = [];
  const pousser = (villes) => {
    for (const c of villes) {
      if (out.length >= limit) return;
      if (vu.has(c.id)) continue;
      vu.add(c.id);
      out.push(c);
    }
  };

  // Les libellés commençant par `q` forment un bloc contigu de l'index trié : on
  // saute directement à son début, puis on le parcourt.
  const bloc = (tri, villes) => {
    const lots = [];
    for (let k = lowerBound(tri, q); k < tri.length && tri[k].startsWith(q); k++) lots.push(villes[k]);
    return lots;
  };
  // Les correspondances viennent de communes différentes : on les fusionne par
  // population plutôt que dans l'ordre alphabétique (« Paris » avant « Parisot »).
  const parPopulation = (lots) => lots.flat().sort((a, b) => b.population - a.population);

  const parNom = bloc(NAMES, NAME_CITIES);
  // Nom exact : c'est la première entrée du bloc, et elle passe devant tout.
  if (NAMES[lowerBound(NAMES, q)] === q) pousser(parNom.shift());
  pousser(parPopulation(parNom));
  if (out.length < limit) pousser(parPopulation(bloc(WORDS, WORD_CITIES)));
  return out.map((c) => publicCity(c));
}

/**
 * Libellé lisible d'une région administrative, pour nommer
 * le salon de région. Table curée d'abord, puis repli « Région de <commune
 * principale> », enfin `null` si le code est vide/inconnu (⇒ pas de salon de région).
 */
function regionLabel(country, code) {
  const cc = String(country || '').toUpperCase();
  const rc = String(code || '').trim();
  if (!rc) return null;
  const key = `${cc}|${rc}`;
  if (REGION_LABEL[key]) return REGION_LABEL[key];
  const top = regionTopCity.get(key);
  return top ? `Région de ${top}` : null;
}

load();

module.exports = { geocode, resolve, suggest, normalize, regionLabel };
