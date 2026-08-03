'use strict';

/**
 * Pré-compression du build front (performance / Core Web Vitals).
 *
 * Compresse une fois pour toutes, à la fin du build, les fichiers texte de
 * `frontend/dist/` en Brotli et en gzip. `server/index.js` sert ensuite la
 * variante `.br`/`.gz` quand le client l'annonce dans `Accept-Encoding`, et
 * l'original sinon.
 *
 * Pourquoi au build plutôt qu'à la volée :
 *  - aucune dépendance npm (zlib est natif, dans l'esprit « zéro-dep » du projet) ;
 *  - niveau de compression maximal, sans coût CPU par requête ;
 *  - aucune interception du flux d'`express.static` (source classique de bugs
 *    sur Content-Length / ETag).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIST = path.join(__dirname, '..', 'frontend', 'dist');

// Seuls les formats texte gagnent à être compressés : PNG et WebP le sont déjà.
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.svg', '.json', '.webmanifest', '.xml', '.txt']);

// Sous ~1 Ko, le gain ne couvre pas le surcoût de la négociation de contenu.
const MIN_BYTES = 1024;

/** Parcours récursif d'un dossier — renvoie les chemins de fichiers. */
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

/** Compresse un fichier dans les deux formats. Renvoie les octets économisés. */
function compress(file) {
  const raw = fs.readFileSync(file);

  const brotli = zlib.brotliCompressSync(raw, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
    },
  });
  fs.writeFileSync(`${file}.br`, brotli);

  const gzip = zlib.gzipSync(raw, { level: zlib.constants.Z_BEST_COMPRESSION });
  fs.writeFileSync(`${file}.gz`, gzip);

  return { raw: raw.length, brotli: brotli.length };
}

function main() {
  if (!fs.existsSync(DIST)) {
    console.error(`[precompress] ${DIST} introuvable — lancez le build avant.`);
    process.exitCode = 1;
    return;
  }

  let count = 0;
  let before = 0;
  let after = 0;

  for (const file of walk(DIST)) {
    const ext = path.extname(file).toLowerCase();
    if (!COMPRESSIBLE.has(ext)) continue;
    if (fs.statSync(file).size < MIN_BYTES) continue;

    const { raw, brotli } = compress(file);
    count += 1;
    before += raw;
    after += brotli;
  }

  const kb = (n) => `${Math.round(n / 1024)} Ko`;
  const saved = before > 0 ? Math.round((1 - after / before) * 100) : 0;
  console.log(`[precompress] ${count} fichiers · ${kb(before)} → ${kb(after)} en Brotli (−${saved} %)`);
}

main();
