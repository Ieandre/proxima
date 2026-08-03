'use strict';

/**
 * Codec PNG minimal — décodage vers RGBA8, encodage depuis RGBA8.
 *
 * Zéro dépendance npm (comme le reste de la boîte à outils du projet) : seul
 * `node:zlib` est utilisé, qui fait déjà tout le travail de compression. Le
 * périmètre est volontairement réduit à ce dont `build-brand-assets.js` a
 * besoin — pas d'entrelacement Adam7, pas de 16 bits en sortie.
 */

const zlib = require('node:zlib');
const fs = require('node:fs');

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Nombre de canaux par type de couleur PNG (0 gris, 2 RVB, 3 palette, 4 gris+A, 6 RVBA). */
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Découpe un fichier PNG en chunks { type, data }. */
function readChunks(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('signature PNG absente');
  const out = [];
  let p = 8;
  while (p + 8 <= buf.length) {
    const length = buf.readUInt32BE(p);
    out.push({ type: buf.toString('ascii', p + 4, p + 8), data: buf.subarray(p + 8, p + 8 + length) });
    p += 12 + length; // longueur (4) + type (4) + données + CRC (4)
  }
  return out;
}

/** Défiltre une image déjà décompressée, en place, selon les filtres par ligne. */
function unfilter(raw, height, stride, bpp) {
  const px = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0, p = 0; y < height; y++) {
    const filter = raw[p++];
    const cur = px.subarray(y * stride, (y + 1) * stride);
    raw.copy(cur, 0, p, p + stride);
    p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      if (filter === 1) cur[i] = (cur[i] + a) & 255;
      else if (filter === 2) cur[i] = (cur[i] + b) & 255;
      else if (filter === 3) cur[i] = (cur[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const guess = a + b - c;
        const da = Math.abs(guess - a);
        const db = Math.abs(guess - b);
        const dc = Math.abs(guess - c);
        cur[i] = (cur[i] + (da <= db && da <= dc ? a : db <= dc ? b : c)) & 255;
      } else if (filter !== 0) throw new Error(`filtre PNG inconnu : ${filter}`);
    }
    prev = cur;
  }
  return px;
}

/** Lit un PNG → { width, height, rgba: Uint8Array } (RGBA8, alpha non prémultiplié). */
function decode(file) {
  const chunks = readChunks(fs.readFileSync(file));
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error('chunk IHDR absent');

  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data[8];
  const colorType = ihdr.data[9];
  if (ihdr.data[12] !== 0) throw new Error('PNG entrelacé non pris en charge');
  if (bitDepth !== 8 && bitDepth !== 16) throw new Error(`profondeur ${bitDepth} bits non prise en charge`);
  if (!(colorType in CHANNELS)) throw new Error(`type de couleur ${colorType} inconnu`);

  const palette = chunks.find((c) => c.type === 'PLTE');
  const transparency = chunks.find((c) => c.type === 'tRNS');
  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const step = bitDepth / 8;
  const bpp = CHANNELS[colorType] * step;
  const px = unfilter(zlib.inflateSync(idat), height, width * bpp, bpp);

  const rgba = new Uint8Array(width * height * 4);
  // En 16 bits on ne garde que l'octet de poids fort : les sorties sont en 8 bits.
  const at = (offset) => px[offset * step];
  for (let i = 0, n = width * height; i < n; i++) {
    const s = i * CHANNELS[colorType];
    const d = i * 4;
    if (colorType === 0 || colorType === 4) {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = at(s);
      rgba[d + 3] = colorType === 4 ? at(s + 1) : 255;
    } else if (colorType === 2 || colorType === 6) {
      rgba[d] = at(s);
      rgba[d + 1] = at(s + 1);
      rgba[d + 2] = at(s + 2);
      rgba[d + 3] = colorType === 6 ? at(s + 3) : 255;
    } else {
      const idx = px[s];
      if (!palette) throw new Error('image indexée sans chunk PLTE');
      rgba[d] = palette.data[idx * 3];
      rgba[d + 1] = palette.data[idx * 3 + 1];
      rgba[d + 2] = palette.data[idx * 3 + 2];
      rgba[d + 3] = transparency && idx < transparency.data.length ? transparency.data[idx] : 255;
    }
  }
  return { width, height, rgba };
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * RGBA8 → tampon PNG. `alpha: false` écrit un PNG RVB (le canal alpha est
 * ignoré) : un tiers d'octets en moins pour une image de toute façon opaque.
 * Le filtre est choisi ligne par ligne sur l'heuristique de somme absolue
 * minimale recommandée par la spécification.
 */
function encode({ width, height, rgba }, { alpha = true } = {}) {
  const channels = alpha ? 4 : 3;
  const stride = width * channels;
  const out = Buffer.alloc(height * (stride + 1));
  let prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  const candidate = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = x * channels;
      cur[d] = rgba[s];
      cur[d + 1] = rgba[s + 1];
      cur[d + 2] = rgba[s + 2];
      if (alpha) cur[d + 3] = rgba[s + 3];
    }
    let bestFilter = 0;
    let bestSum = Infinity;
    let bestLine = null;
    for (const filter of [0, 1, 2, 3, 4]) {
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? cur[i - channels] : 0;
        const b = prev[i];
        const c = i >= channels ? prev[i - channels] : 0;
        let v;
        if (filter === 0) v = cur[i];
        else if (filter === 1) v = cur[i] - a;
        else if (filter === 2) v = cur[i] - b;
        else if (filter === 3) v = cur[i] - ((a + b) >> 1);
        else {
          const guess = a + b - c;
          const da = Math.abs(guess - a);
          const db = Math.abs(guess - b);
          const dc = Math.abs(guess - c);
          v = cur[i] - (da <= db && da <= dc ? a : db <= dc ? b : c);
        }
        candidate[i] = v & 255;
        sum += Math.min(candidate[i], 256 - candidate[i]);
        if (sum >= bestSum) break;
      }
      if (sum < bestSum) {
        bestSum = sum;
        bestFilter = filter;
        bestLine = Buffer.from(candidate);
      }
    }
    out[y * (stride + 1)] = bestFilter;
    bestLine.copy(out, y * (stride + 1) + 1);
    cur.copy(prev);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;                       // profondeur
  ihdr[9] = alpha ? 6 : 2;           // type de couleur
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(out, { level: 9, memLevel: 9, windowBits: 15 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { decode, encode };
