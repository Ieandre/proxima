'use strict';

/**
 * Génère la base géographique embarquée : `server/data/cities.json` (toutes les
 * communes) et `server/data/postal.json` (index code postal -> communes).
 *
 * Pourquoi les deux d'un seul geste : `postal.json` désigne les communes par leur
 * **rang** dans `cities.json`. Les générer séparément, c'était pouvoir rattacher
 * les gens à des communes au hasard ; un seul script rend la désynchronisation
 * impossible (`cities.js` garde le garde-fou au boot, par prudence).
 *
 * Périmètre : **l'entièreté des communes** de France (34 963), Belgique (565),
 * Suisse (2 113), Luxembourg (105) et Monaco. La base s'arrêtait auparavant aux
 * villes de ~1 200 habitants — 10 % du pays seulement — et une petite commune
 * n'avait d'autre porte d'entrée que son code postal.
 *
 * Sources (ouvertes, sans clé d'API) :
 *   · France  — API Découpage administratif (geo.api.gouv.fr, base INSEE COG) :
 *              nom officiel accentué, code INSEE, codes postaux, centre, population.
 *   · BE/CH/LU/MC — dumps GeoNames (CC BY 4.0) : communes = ADM4 (BE), ADM3 (CH),
 *              ADM2 (LU), PPLC+PPLX (MC) ; noms français via `alternatenames/`.
 *   · Codes postaux BE/CH/LU/MC — export « postal codes » GeoNames.
 *
 * Usage :
 *   node scripts/build-geo.js              # télécharge (cache local) puis génère
 *   node scripts/build-geo.js --refresh    # ignore le cache et retélécharge
 *   node scripts/build-geo.js --cache <d>  # dossier de cache (défaut .geo-cache/)
 *
 * Les téléchargements sont mis en cache pour qu'une seconde exécution soit
 * instantanée et hors-ligne. Le cache n'est pas versionné.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_CITIES = path.join(__dirname, '..', 'server', 'data', 'cities.json');
const OUT_POSTAL = path.join(__dirname, '..', 'server', 'data', 'postal.json');

const args = process.argv.slice(2);
const REFRESH = args.includes('--refresh');
const CACHE = (() => {
  const i = args.indexOf('--cache');
  return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : path.join(__dirname, '..', '.geo-cache');
})();

/** Pays couverts, dans l'ordre d'affichage des libellés. */
const GEONAMES = ['BE', 'CH', 'LU', 'MC'];

/** Code GeoNames de la maille « commune », qui diffère selon le pays. */
const COMMUNE_FEATURE = { BE: ['ADM4'], CH: ['ADM3'], LU: ['ADM2'], MC: ['PPLC', 'PPLX'] };

/**
 * Colonne GeoNames servant de **subdivision de désambiguïsation** — ce qu'on
 * affiche à côté du nom pour distinguer deux communes homonymes. En Belgique
 * c'est la province (admin2) ; en Suisse et au Luxembourg le canton est déjà la
 * région (admin1), on ne répète donc pas l'information.
 */
const SUB_COLUMN = { BE: 11, CH: null, LU: null, MC: null };

/** Provinces belges en français : le dump ne les donne qu'en langue locale. */
const BE_PROVINCES = {
  VAN: 'Anvers',
  VBR: 'Brabant flamand',
  VLI: 'Limbourg',
  VOV: 'Flandre-Orientale',
  VWV: 'Flandre-Occidentale',
  WBR: 'Brabant wallon',
  WHT: 'Hainaut',
  WLG: 'Liège',
  WLX: 'Luxembourg',
  WNA: 'Namur',
  BRU: 'Bruxelles-Capitale',
};

/**
 * Collectivités d'outre-mer : elles ont un code « département » dans la base
 * INSEE mais n'apparaissent pas dans la liste des départements de l'API.
 */
const FR_COM = {
  975: 'Saint-Pierre-et-Miquelon',
  977: 'Saint-Barthélemy',
  978: 'Saint-Martin',
  986: 'Wallis-et-Futuna',
  987: 'Polynésie française',
  988: 'Nouvelle-Calédonie',
};

/** Au-delà, rattacher un code postal à une commune connue n'a plus de sens. */
const MAX_KM = 35;
/** En deçà, le lieu du code postal et la commune sont le même endroit. */
const MEME_LIEU_KM = 5;
/** Un code postal ne doit pas noyer la liste de suggestions. */
const MAX_PAR_CODE = 8;

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

/** Même normalisation que `server/cities.js` (accents, casse, séparateurs). */
function normalize(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Télécharge une ressource, ou la relit du cache (`--refresh` pour forcer). */
async function fetchCached(url, nom) {
  const cible = path.join(CACHE, nom);
  if (!REFRESH && fs.existsSync(cible)) return fs.readFileSync(cible);
  fs.mkdirSync(CACHE, { recursive: true });
  process.stdout.write(`[geo] téléchargement ${nom}… `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(cible, buf);
  console.log(`${(buf.length / 1024).toFixed(0)} Ko`);
  return buf;
}

/**
 * Extrait un fichier d'une archive ZIP. On lit le **répertoire central** (fin de
 * l'archive), seul endroit où les tailles sont garanties exactes. `zlib` suffit :
 * pas de dépendance npm, pas d'appel à un `unzip` système.
 */
function unzipEntry(buf, nom) {
  const EOCD = 0x06054b50;
  let fin = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error('archive ZIP illisible (fin de répertoire central introuvable)');
  const nb = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  for (let k = 0; k < nb; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('répertoire central ZIP corrompu');
    const methode = buf.readUInt16LE(p + 10);
    const tailleComp = buf.readUInt32LE(p + 20);
    const lNom = buf.readUInt16LE(p + 28);
    const lExtra = buf.readUInt16LE(p + 30);
    const lComm = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const entree = buf.toString('utf-8', p + 46, p + 46 + lNom);
    if (entree === nom) {
      // L'en-tête local répète nom et extra, dont les longueurs peuvent différer.
      const debut = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
      const data = buf.subarray(debut, debut + tailleComp);
      return methode === 0 ? data : zlib.inflateRawSync(data);
    }
    p += 46 + lNom + lExtra + lComm;
  }
  throw new Error(`${nom} absent de l'archive`);
}

/** Lignes d'un fichier GeoNames (TSV sans en-tête). */
const tsv = (texte) =>
  texte
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'));

// ---------------------------------------------------------------------------
// Communes
// ---------------------------------------------------------------------------

/**
 * France : API Découpage administratif. Les 6 entités sans population (districts
 * des Terres australes, île de Clipperton) sont écartées — personne n'y habite,
 * et elles créeraient des salons de région fantômes.
 */
async function communesFR() {
  const communes = JSON.parse(
    (
      await fetchCached(
        'https://geo.api.gouv.fr/communes?fields=nom,code,codesPostaux,centre,codeRegion,codeDepartement,population&format=json',
        'fr-communes.json',
      )
    ).toString('utf-8'),
  );
  const departements = JSON.parse(
    (await fetchCached('https://geo.api.gouv.fr/departements?fields=nom,code', 'fr-departements.json')).toString(
      'utf-8',
    ),
  );

  const subs = {};
  for (const d of departements) subs[`FR|${d.code}`] = d.nom;
  for (const [code, nom] of Object.entries(FR_COM)) subs[`FR|${code}`] = nom;

  const villes = [];
  const postal = []; // [code postal, ville] — les codes viennent de la source, exacts par construction
  let ecartees = 0;
  for (const c of communes) {
    if (c.population == null || !c.centre) {
      ecartees++;
      continue;
    }
    const ville = {
      i: c.code, // code INSEE : identifiant stable, insensible aux fusions de communes homonymes
      n: c.nom,
      lat: Number(c.centre.coordinates[1].toFixed(4)),
      lon: Number(c.centre.coordinates[0].toFixed(4)),
      c: 'FR',
      r: c.codeRegion,
      d: c.codeDepartement,
      p: c.population,
    };
    villes.push(ville);
    for (const cp of c.codesPostaux || []) postal.push([cp, ville]);
  }
  console.log(`[geo] France : ${villes.length} communes (${ecartees} inhabitées écartées)`);
  return { villes, subs, postal };
}

/**
 * BE/CH/LU/MC : dumps GeoNames. Le nom canonique reste le nom officiel local
 * (« Antwerpen », « Zürich ») ; le nom français, quand il existe, devient un
 * alias cherchable — sauf en Wallonie et à Bruxelles, où il *est* le nom officiel
 * (le dump donne sinon « City of Brussels »).
 */
async function communesGeoNames() {
  const villes = [];
  const subs = {};

  for (const pays of GEONAMES) {
    const dump = tsv(unzipEntry(await fetchCached(`https://download.geonames.org/export/dump/${pays}.zip`, `${pays}.txt.zip`), `${pays}.txt`).toString('utf-8'));
    const alts = tsv(
      unzipEntry(
        await fetchCached(`https://download.geonames.org/export/dump/alternatenames/${pays}.zip`, `alt-${pays}.zip`),
        `${pays}.txt`,
      ).toString('utf-8'),
    );

    // Noms français par identifiant GeoNames (le nom « préféré » gagne).
    const fr = new Map();
    for (const a of alts) {
      if (a[2] !== 'fr' || a[7] === '1') continue; // ni autre langue, ni nom historique
      if (!fr.has(a[1]) || a[4] === '1') fr.set(a[1], a[3]);
    }

    // Libellés de subdivision : le dump se décrit lui-même (lignes ADM1/ADM2).
    if (pays === 'BE') for (const [code, nom] of Object.entries(BE_PROVINCES)) subs[`BE|${code}`] = nom;
    if (pays === 'MC') subs['MC|00'] = 'Monaco';

    const codes = COMMUNE_FEATURE[pays];
    const colSub = SUB_COLUMN[pays];
    let n = 0;
    for (const r of dump) {
      if (!codes.includes(r[7])) continue;
      const pop = Number(r[14]) || 0;
      // Monaco : le dump mêle aux quartiers quelques entités qui n'en sont pas.
      if (pays === 'MC' && pop === 0) continue;
      const nomFr = fr.get(r[0]);
      const region = r[10] || (pays === 'MC' ? '00' : '');
      const officielFr = pays === 'BE' && (region === 'WAL' || region === 'BRU');
      // GeoNames suffixe 146 communes suisses homonymes de leur canton
      // (« Wetzikon (ZH) ») : on affiche le canton à côté du nom de toute façon,
      // le suffixe ne serait qu'un artefact de source. Il reste cherchable en alias.
      const brut = r[1];
      const nom = (officielFr && nomFr ? nomFr : brut).replace(/ \([A-Z]{2}\)$/, '');
      const ville = {
        i: r[0], // identifiant GeoNames : stable dans le temps
        n: nom,
        lat: Number(Number(r[4]).toFixed(4)),
        lon: Number(Number(r[5]).toFixed(4)),
        c: pays,
        r: region,
        p: pop,
      };
      if (colSub && r[colSub]) ville.d = r[colSub];
      // Alias : le nom français quand il n'est pas déjà le nom canonique (« Anvers »
      // doit trouver « Antwerpen »), et l'asciiname pour les translittérations.
      const alias = [nomFr, brut, r[2]].filter((a) => a && normalize(a) !== normalize(nom));
      if (alias.length) ville.alt = [...new Set(alias)];
      villes.push(ville);
      n++;
    }
    console.log(`[geo] ${pays} : ${n} communes`);
  }
  return { villes, subs };
}

// ---------------------------------------------------------------------------
// Codes postaux
// ---------------------------------------------------------------------------

/**
 * Index code postal -> communes. La France est exacte par construction (les codes
 * viennent de la fiche de chaque commune) ; pour BE/CH/LU/MC on lit l'export
 * postal GeoNames, dont les lieux sont parfois des localités sans commune
 * homonyme : on les rattache alors à la commune connue la plus proche, en disant
 * laquelle (`via`), ce qui reste sans conséquence sur un voisinage de 75 km.
 */
async function buildPostal(villes, postalFR) {
  const rang = new Map(villes.map((v, i) => [v, i]));
  // Index par nom et grille spatiale d'un demi-degré : on ne balaye pas
  // 37 000 communes à chaque code postal.
  const parNom = new Map(); // `PAYS|nom normalisé` -> rang
  const grille = new Map(); // `PAYS|latCell|lonCell` -> [rangs]
  const cell = (lat, lon) => `${Math.round(lat * 2)}|${Math.round(lon * 2)}`;
  villes.forEach((v, i) => {
    for (const nom of [v.n, ...(v.alt || [])]) {
      const k = `${v.c}|${normalize(nom)}`;
      if (!parNom.has(k)) parNom.set(k, i);
    }
    const gk = `${v.c}|${cell(v.lat, v.lon)}`;
    if (!grille.has(gk)) grille.set(gk, []);
    grille.get(gk).push(i);
  });

  const plusProche = (pays, lat, lon) => {
    const cLat = Math.round(lat * 2);
    const cLon = Math.round(lon * 2);
    let best = -1;
    let bestKm = Infinity;
    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLon = -1; dLon <= 1; dLon++) {
        for (const i of grille.get(`${pays}|${cLat + dLat}|${cLon + dLon}`) || []) {
          const km = haversine(lat, lon, villes[i].lat, villes[i].lon);
          if (km < bestKm) {
            bestKm = km;
            best = i;
          }
        }
      }
    }
    return { rang: best, km: bestKm };
  };

  const codes = new Map(); // code postal -> Map(rang -> { via, communes })
  const stats = { lus: 0, exacts: 0, rattaches: 0, ignores: 0 };

  const ajouter = (code, r, via) => {
    if (!codes.has(code)) codes.set(code, new Map());
    const pour = codes.get(code);
    const dejaLa = pour.get(r);
    if (!dejaLa) pour.set(r, { via, communes: new Set(via ? [via] : []) });
    else if (via === null) dejaLa.via = null; // un rattachement exact l'emporte
    else if (dejaLa.via !== null) dejaLa.communes.add(via);
  };

  for (const [code, ville] of postalFR) {
    stats.lus++;
    stats.exacts++;
    ajouter(code, rang.get(ville), null);
  }

  for (const pays of GEONAMES) {
    const buf = await fetchCached(`https://download.geonames.org/export/zip/${pays}.zip`, `zip-${pays}.zip`);
    for (const col of tsv(unzipEntry(buf, `${pays}.txt`).toString('utf-8'))) {
      const [pc, code, lieu] = [col[0], col[1], col[2]];
      const lat = Number(col[9]);
      const lon = Number(col[10]);
      if (pc !== pays || !code || !lieu || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      stats.lus++;

      let r = parNom.get(`${pays}|${normalize(lieu)}`);
      let via = null;
      if (r === undefined) {
        const proche = plusProche(pays, lat, lon);
        if (proche.rang < 0 || proche.km > MAX_KM) {
          stats.ignores++;
          continue;
        }
        r = proche.rang;
        // Le nom du lieu n'est repris que s'il désigne vraiment un autre endroit :
        // « Lausanne 25 » rattaché à Lausanne à 400 m ne mérite pas de mention.
        if (proche.km > MEME_LIEU_KM) via = lieu;
        stats.rattaches++;
      } else {
        stats.exacts++;
      }
      ajouter(code, r, via);
    }
  }

  // Communes rattachées exactement d'abord, puis les plus peuplées.
  const out = {};
  for (const [code, pour] of codes) {
    out[code] = [...pour.entries()]
      .sort((a, b) => (a[1].via === null ? 0 : 1) - (b[1].via === null ? 0 : 1) || villes[b[0]].p - villes[a[0]].p)
      .slice(0, MAX_PAR_CODE)
      .map(([r, e]) => {
        // Plusieurs localités du même code aboutissent à cette commune : en nommer
        // une seule désignerait un voisin au hasard, ce qui déroute plus qu'il n'aide.
        const via = e.via !== null && e.communes.size === 1 ? e.via : null;
        return via ? [r, via] : [r];
      });
  }
  return { out, stats };
}

// ---------------------------------------------------------------------------

async function main() {
  const fr = await communesFR();
  const gn = await communesGeoNames();

  // Tri par population décroissante : `cities.js` en dépend deux fois — la commune
  // la plus peuplée gagne en cas d'homonymie, et sert de repli au libellé de région.
  const villes = [...fr.villes, ...gn.villes].sort((a, b) => b.p - a.p);
  const subs = { ...fr.subs, ...gn.subs };

  const doublons = villes.length - new Set(villes.map((v) => `${v.c}-${v.i}`)).size;
  if (doublons) throw new Error(`${doublons} identifiants de commune en doublon — index inutilisable`);

  const { out, stats } = await buildPostal(villes, fr.postal);

  fs.writeFileSync(OUT_CITIES, JSON.stringify({ v: 2, subs, cities: villes }));
  fs.writeFileSync(
    OUT_POSTAL,
    JSON.stringify({ cities: villes.length, codes: Object.fromEntries(Object.entries(out).sort()) }),
  );

  const ko = (f) => (fs.statSync(f).size / 1024).toFixed(0);
  console.log(
    `[geo] ${stats.lus} lignes postales · ${stats.exacts} correspondances exactes · ` +
      `${stats.rattaches} rattachées à la commune la plus proche · ${stats.ignores} hors de portée (> ${MAX_KM} km)`,
  );
  console.log(`[geo] cities.json : ${villes.length} communes, ${Object.keys(subs).length} subdivisions (${ko(OUT_CITIES)} Ko)`);
  console.log(`[geo] postal.json : ${Object.keys(out).length} codes postaux (${ko(OUT_POSTAL)} Ko)`);
}

main().catch((err) => {
  console.error('[geo]', err.message);
  process.exit(1);
});
