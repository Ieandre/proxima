'use strict';

/**
 * Régénère tous les assets de marque de `frontend/public/` à partir d'un seul
 * fichier source : le logo pleine résolution.
 *
 *   node scripts/build-brand-assets.js [source.png]
 *
 * Source par défaut : `frontend/public/logo.png`, qui est aussi une des sorties.
 * Le script est donc idempotent — il recadre la forme sur sa boîte englobante
 * puis réapplique une marge fixe, si bien que le relancer sur sa propre sortie
 * redonne exactement le même fichier. On peut ainsi lui passer l'export brut
 * d'un outil de design une première fois, puis le rejouer sans rien casser.
 *
 * Sorties (toutes dans `frontend/public/`) :
 *   logo.png                 1024×1024, référence (JSON-LD Organization)
 *   logo.svg                 vectoriel tracé depuis le raster — c'est lui que
 *                            l'interface et le favicon utilisent (~1,5 Ko)
 *   favicon.png              32×32, repli pour les navigateurs sans favicon SVG
 *   apple-touch-icon.png     180×180, fond opaque (iOS ignore la transparence)
 *   icon-192.png             192×192, manifeste PWA, purpose « any »
 *   icon-512.png             512×512, manifeste PWA, purpose « any »
 *   icon-maskable-512.png    512×512, purpose « maskable » : marque dans la
 *                            zone sûre centrale, fond opaque (Android rogne)
 *   og-image.png             1200×630, la marque est réintégrée dans l'aperçu
 *                            de lien existant (typographie inchangée)
 *
 * Zéro dépendance npm : décodage/encodage PNG par `scripts/lib/png.js`,
 * rééchantillonnage et tracé de contour implémentés ici.
 */

const fs = require('node:fs');
const path = require('node:path');
const { decode, encode } = require('./lib/png');

const PUBLIC_DIR = path.join(__dirname, '..', 'frontend', 'public');
const SOURCE = process.argv[2] || path.join(PUBLIC_DIR, 'logo.png');

/** Plaque opaque des icônes qui n'admettent pas la transparence. Doit rester
 *  alignée sur `--color-paper` du thème sombre (`frontend/src/index.css`). */
const PLATE = [0x08, 0x0d, 0x17];

/** Seuil d'alpha au-delà duquel un pixel compte comme « de la forme ». */
const INK = 8;

/** Respiration laissée de chaque côté de la marque. Partagée par le SVG et les
 *  icônes « any » pour qu'ils se superposent exactement à taille égale. */
const ICON_MARGIN = 0.04;

/* ========================================================================== */
/*  Primitives image                                                          */
/* ========================================================================== */

/** Boîte englobante des pixels non transparents. */
function inkBounds({ width, height, rgba }) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] <= INK) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error('image entièrement transparente');
  return { x0, y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/**
 * Rééchantillonne la région `box` de `src` vers une image `outW × outH`.
 *
 * Moyenne d'aire exacte (chaque pixel source contribue au prorata de son
 * recouvrement) calculée en alpha prémultiplié : sans prémultiplication, les
 * pixels transparents feraient baver leur couleur résiduelle sur les bords.
 */
function resample(src, box, outW, outH) {
  const out = new Uint8Array(outW * outH * 4);
  const sx = box.width / outW;
  const sy = box.height / outH;

  for (let j = 0; j < outH; j++) {
    const top = box.y0 + j * sy;
    const bottom = top + sy;
    for (let i = 0; i < outW; i++) {
      const left = box.x0 + i * sx;
      const right = left + sx;
      let r = 0, g = 0, b = 0, a = 0, w = 0;

      for (let y = Math.floor(top); y < Math.ceil(bottom); y++) {
        if (y < 0 || y >= src.height) continue;
        const wy = Math.min(y + 1, bottom) - Math.max(y, top);
        if (wy <= 0) continue;
        for (let x = Math.floor(left); x < Math.ceil(right); x++) {
          if (x < 0 || x >= src.width) continue;
          const wx = Math.min(x + 1, right) - Math.max(x, left);
          if (wx <= 0) continue;
          const s = (y * src.width + x) * 4;
          const alpha = src.rgba[s + 3] / 255;
          const weight = wx * wy;
          r += src.rgba[s] * alpha * weight;
          g += src.rgba[s + 1] * alpha * weight;
          b += src.rgba[s + 2] * alpha * weight;
          a += alpha * weight;
          w += weight;
        }
      }

      const d = (j * outW + i) * 4;
      if (w > 0 && a > 0) {
        out[d] = Math.round(Math.min(255, r / a));       // dé-prémultiplication
        out[d + 1] = Math.round(Math.min(255, g / a));
        out[d + 2] = Math.round(Math.min(255, b / a));
        out[d + 3] = Math.round(Math.min(255, (a / w) * 255));
      }
    }
  }
  return { width: outW, height: outH, rgba: out };
}

/** Épaisseur, en pixels, du halo de couleur propagé hors de la forme. */
const BLEED = 8;

/**
 * Donne une couleur utile aux pixels totalement transparents.
 *
 * Un consommateur correct prémultiplie avant de redimensionner : la couleur des
 * pixels d'alpha nul ne l'atteint jamais. Les autres — certains navigateurs, des
 * aspirateurs d'aperçu de lien — mélangent ces valeurs aux bords de la forme et
 * feraient apparaître un liseré. On propage donc la couleur du bord sur quelques
 * pixels (assez pour tout noyau de redimensionnement raisonnable), puis on
 * remplit le lointain d'une couleur constante : uniforme, elle ne coûte presque
 * rien à la compression, là où un dégradé de Voronoï doublerait le fichier.
 */
function bleedColor(img) {
  const { width, height, rgba } = img;
  const queue = new Int32Array(width * height);
  const depth = new Int32Array(width * height).fill(-1);
  let head = 0, tail = 0;

  for (let i = 0; i < width * height; i++) {
    if (rgba[i * 4 + 3] > 0) { depth[i] = 0; queue[tail++] = i; }
  }
  let edgeR = 0, edgeG = 0, edgeB = 0, edgeN = 0;
  while (head < tail) {
    const i = queue[head++];
    if (depth[i] >= BLEED) continue;
    const x = i % width, y = (i - x) / width;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (depth[n] >= 0) continue;
      depth[n] = depth[i] + 1;
      rgba[n * 4] = rgba[i * 4];
      rgba[n * 4 + 1] = rgba[i * 4 + 1];
      rgba[n * 4 + 2] = rgba[i * 4 + 2];
      queue[tail++] = n;
      if (depth[n] === BLEED) { edgeR += rgba[n * 4]; edgeG += rgba[n * 4 + 1]; edgeB += rgba[n * 4 + 2]; edgeN++; }
    }
  }

  const far = edgeN
    ? [Math.round(edgeR / edgeN), Math.round(edgeG / edgeN), Math.round(edgeB / edgeN)]
    : [0, 0, 0];
  for (let i = 0; i < width * height; i++) {
    if (depth[i] >= 0) continue;
    rgba[i * 4] = far[0];
    rgba[i * 4 + 1] = far[1];
    rgba[i * 4 + 2] = far[2];
  }
  return img;
}

/** Compose `src` sur `dst` en source-over, coin haut-gauche en (offX, offY). */
function composite(dst, src, offX, offY) {
  for (let y = 0; y < src.height; y++) {
    const dy = offY + y;
    if (dy < 0 || dy >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = offX + x;
      if (dx < 0 || dx >= dst.width) continue;
      const s = (y * src.width + x) * 4;
      const d = (dy * dst.width + dx) * 4;
      const sa = src.rgba[s + 3] / 255;
      if (sa === 0) continue;
      const da = dst.rgba[d + 3] / 255;
      const oa = sa + da * (1 - sa);
      for (let k = 0; k < 3; k++) {
        dst.rgba[d + k] = Math.round((src.rgba[s + k] * sa + dst.rgba[d + k] * da * (1 - sa)) / oa);
      }
      dst.rgba[d + 3] = Math.round(oa * 255);
    }
  }
  return dst;
}

/**
 * Dessine la marque au centre d'un canevas carré.
 * `margin` est la part de côté laissée libre de chaque côté (0,06 = 6 %).
 * `plate` remplit le fond d'une couleur opaque (icônes sans transparence).
 * `noUpscale` interdit d'agrandir la forme : un agrandissement par moyenne
 * d'aire dégénère en plus-proche-voisin et crée un escalier sur les bords.
 */
function renderMark(master, box, size, { margin = 0, plate = null, noUpscale = false } = {}) {
  const canvas = { width: size, height: size, rgba: new Uint8Array(size * size * 4) };
  if (plate) {
    for (let i = 0; i < size * size; i++) {
      canvas.rgba[i * 4] = plate[0];
      canvas.rgba[i * 4 + 1] = plate[1];
      canvas.rgba[i * 4 + 2] = plate[2];
      canvas.rgba[i * 4 + 3] = 255;
    }
  }
  const room = size * (1 - 2 * margin);
  let scale = room / Math.max(box.width, box.height);
  if (noUpscale) scale = Math.min(1, scale);
  const markW = Math.max(1, Math.round(box.width * scale));
  const markH = Math.max(1, Math.round(box.height * scale));
  const mark = resample(master, box, markW, markH);
  composite(canvas, mark, Math.round((size - markW) / 2), Math.round((size - markH) / 2));
  return plate ? canvas : bleedColor(canvas);
}

/* ========================================================================== */
/*  Tracé vectoriel                                                           */
/* ========================================================================== */

/**
 * Extrait les contours de l'isoligne alpha = 128 par « marching squares ».
 * L'interpolation linéaire sur les arêtes donne une précision sous-pixel :
 * le contour suit le bord antialiasé, pas la grille de pixels.
 */
function traceContours({ width, height, rgba }) {
  const T = 128;
  const alpha = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : rgba[(y * width + x) * 4 + 3]);
  const cut = (x1, y1, a1, x2, y2, a2) => {
    const t = (T - a1) / (a2 - a1);
    return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
  };

  const segments = [];
  for (let y = -1; y < height; y++) {
    for (let x = -1; x < width; x++) {
      const a = alpha(x, y), b = alpha(x + 1, y), c = alpha(x + 1, y + 1), d = alpha(x, y + 1);
      const code = (a >= T ? 8 : 0) | (b >= T ? 4 : 0) | (c >= T ? 2 : 0) | (d >= T ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const top = () => cut(x, y, a, x + 1, y, b);
      const right = () => cut(x + 1, y, b, x + 1, y + 1, c);
      const bottom = () => cut(x + 1, y + 1, c, x, y + 1, d);
      const left = () => cut(x, y + 1, d, x, y, a);
      // Orientation : l'intérieur de la forme reste à gauche du segment.
      switch (code) {
        case 1: segments.push([bottom(), left()]); break;
        case 2: segments.push([right(), bottom()]); break;
        case 3: segments.push([right(), left()]); break;
        case 4: segments.push([top(), right()]); break;
        case 5: segments.push([top(), left()], [bottom(), right()]); break;
        case 6: segments.push([top(), bottom()]); break;
        case 7: segments.push([top(), left()]); break;
        case 8: segments.push([left(), top()]); break;
        case 9: segments.push([bottom(), top()]); break;
        case 10: segments.push([left(), bottom()], [right(), top()]); break;
        case 11: segments.push([right(), top()]); break;
        case 12: segments.push([left(), right()]); break;
        case 13: segments.push([bottom(), right()]); break;
        case 14: segments.push([left(), bottom()]); break;
      }
    }
  }

  // Recollage bout à bout : chaque segment part d'un point où un autre arrive.
  const key = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const startingAt = new Map();
  for (const s of segments) {
    const k = key(s[0]);
    if (!startingAt.has(k)) startingAt.set(k, []);
    startingAt.get(k).push(s);
  }
  const used = new Set();
  const loops = [];
  for (const first of segments) {
    if (used.has(first)) continue;
    const loop = [first[0]];
    let current = first;
    while (current && !used.has(current)) {
      used.add(current);
      loop.push(current[1]);
      current = (startingAt.get(key(current[1])) || []).find((s) => !used.has(s));
    }
    if (loop.length > 8) loops.push(loop);
  }
  return loops.sort((a, b) => b.length - a.length);
}

/** Simplification de Ramer-Douglas-Peucker sur une polyligne ouverte. */
function simplifyOpen(points, tolerance) {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1e-9;
  let worst = -1, at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.abs((points[i][0] - ax) * dy - (points[i][1] - ay) * dx) / len;
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...simplifyOpen(points.slice(0, at + 1), tolerance).slice(0, -1),
    ...simplifyOpen(points.slice(at), tolerance),
  ];
}

/**
 * Simplification d'un contour fermé. On le coupe d'abord au point le plus
 * éloigné du départ : appliqué directement, Douglas-Peucker verrait une corde
 * de longueur nulle (départ = arrivée) et réduirait la boucle à deux points.
 */
function simplifyClosed(loop, tolerance) {
  const points = loop.slice(0, -1);
  let far = 0, best = -1;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]);
    if (d > best) { best = d; far = i; }
  }
  const head = simplifyOpen(points.slice(0, far + 1), tolerance);
  const tail = simplifyOpen([...points.slice(far), points[0]], tolerance);
  return [...head.slice(0, -1), ...tail.slice(0, -1)];
}

/**
 * Ajuste le dégradé linéaire de la marque.
 *
 * Chaque canal est modélisé comme une fonction affine de (x, y) par moindres
 * carrés ; le canal de plus forte pente donne l'axe du dégradé. Les arrêts sont
 * ensuite des moyennes par tranche le long de cet axe, ce qui restitue aussi
 * les écarts à l'affine (saturation d'un canal à 0, par exemple).
 */
function fitGradient({ width, height, rgba }) {
  const pixels = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3] >= 250) pixels.push([x, y, rgba[i], rgba[i + 1], rgba[i + 2]]);
    }
  }
  if (!pixels.length) throw new Error('aucun pixel opaque : dégradé inajustable');

  const plane = (channel) => {
    let n = 0, sx = 0, sy = 0, sv = 0, sxx = 0, sxy = 0, syy = 0, sxv = 0, syv = 0;
    for (const p of pixels) {
      const [x, y] = p, v = p[2 + channel];
      n++; sx += x; sy += y; sv += v;
      sxx += x * x; sxy += x * y; syy += y * y; sxv += x * v; syv += y * v;
    }
    const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
    const b = [sxv, syv, sv];
    for (let i = 0; i < 3; i++) {               // élimination de Gauss, pivot partiel
      let pivot = i;
      for (let r = i + 1; r < 3; r++) if (Math.abs(A[r][i]) > Math.abs(A[pivot][i])) pivot = r;
      [A[i], A[pivot]] = [A[pivot], A[i]];
      [b[i], b[pivot]] = [b[pivot], b[i]];
      for (let r = i + 1; r < 3; r++) {
        const f = A[r][i] / A[i][i];
        for (let c = i; c < 3; c++) A[r][c] -= f * A[i][c];
        b[r] -= f * b[i];
      }
    }
    const s = [0, 0, 0];
    for (let i = 2; i >= 0; i--) {
      let t = b[i];
      for (let c = i + 1; c < 3; c++) t -= A[i][c] * s[c];
      s[i] = t / A[i][i];
    }
    return s;                                    // [∂/∂x, ∂/∂y, constante]
  };

  const planes = [0, 1, 2].map(plane);
  const strongest = planes.reduce((a, b) => (Math.hypot(b[0], b[1]) > Math.hypot(a[0], a[1]) ? b : a));
  const norm = Math.hypot(strongest[0], strongest[1]);
  const ux = strongest[0] / norm;
  const uy = strongest[1] / norm;

  // Bornes robustes : les extrêmes stricts ne sont qu'une poignée de pixels de coin.
  const ts = pixels.map(([x, y]) => x * ux + y * uy).sort((a, b) => a - b);
  const lo = ts[Math.floor(ts.length * 0.002)];
  const hi = ts[Math.floor(ts.length * 0.998)];

  const BINS = 24;
  const acc = Array.from({ length: BINS }, () => [0, 0, 0, 0]);
  for (const p of pixels) {
    const t = p[0] * ux + p[1] * uy;
    const b = Math.min(BINS - 1, Math.max(0, Math.floor(((t - lo) / (hi - lo)) * BINS)));
    acc[b][0] += p[2]; acc[b][1] += p[3]; acc[b][2] += p[4]; acc[b][3]++;
  }
  const reliable = acc
    .map((e, b) => ({ at: (b + 0.5) / BINS, color: e[3] ? [e[0] / e[3], e[1] / e[3], e[2] / e[3]] : null, n: e[3] }))
    .filter((e) => e.n > 500);

  const sample = (offset) => {
    if (offset <= reliable[0].at) return reliable[0].color;
    const last = reliable[reliable.length - 1];
    if (offset >= last.at) return last.color;
    for (let i = 0; i + 1 < reliable.length; i++) {
      if (offset <= reliable[i + 1].at) {
        const f = (offset - reliable[i].at) / (reliable[i + 1].at - reliable[i].at);
        return [0, 1, 2].map((k) => reliable[i].color[k] + f * (reliable[i + 1].color[k] - reliable[i].color[k]));
      }
    }
    return last.color;
  };

  const OFFSETS = [0, 0.25, 0.5, 0.75, 1];
  const stops = OFFSETS.map((o) => ({
    offset: o,
    color: '#' + sample(o)
      .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
      .join(''),
  }));

  return { ux, uy, lo, hi, stops };
}

/** Tracé + dégradé → document SVG autonome dans un viewBox carré de 64 unités. */
function buildSvg(master, box) {
  const VIEW = 64;
  const MARGIN = VIEW * ICON_MARGIN;              // exactement la marge des icônes
  const TOLERANCE = 0.6;                         // en pixels source (≈ 0,04 unité de viewBox)

  const loops = traceContours(master).map((l) => simplifyClosed(l, TOLERANCE));
  if (!loops.length) throw new Error('aucun contour tracé');

  const scale = (VIEW - 2 * MARGIN) / Math.max(box.width, box.height);
  const offX = MARGIN + (VIEW - 2 * MARGIN - box.width * scale) / 2;
  const offY = MARGIN + (VIEW - 2 * MARGIN - box.height * scale) / 2;
  const mapX = (x) => (x - box.x0) * scale + offX;
  const mapY = (y) => (y - box.y0) * scale + offY;
  const num = (v) => {
    const s = v.toFixed(2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    return s === '-0' ? '0' : s;
  };

  // `evenodd` fait de l'étoile un évidement : elle laisse voir le fond, ce qui
  // permet à la marque de fonctionner sur le thème clair comme sur le sombre.
  const d = loops
    .map((loop) => 'M' + loop.map(([x, y]) => `${num(mapX(x))} ${num(mapY(y))}`).join('L') + 'Z')
    .join('');

  const { ux, uy, lo, hi, stops } = fitGradient(master);
  const gradient = `<linearGradient id="a" gradientUnits="userSpaceOnUse" `
    + `x1="${num(mapX(lo * ux))}" y1="${num(mapY(lo * uy))}" `
    + `x2="${num(mapX(hi * ux))}" y2="${num(mapY(hi * uy))}">`
    + stops.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('')
    + '</linearGradient>';

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" role="img" aria-label="Proxima">`
      + gradient
      + `<path fill="url(#a)" fill-rule="evenodd" d="${d}"/></svg>\n`,
    points: loops.reduce((a, l) => a + l.length, 0),
    stops,
  };
}

/* ========================================================================== */
/*  Aperçu de lien (Open Graph)                                               */
/* ========================================================================== */

/**
 * Emplacement de la marque dans `og-image.png`, tel que composé par la maquette
 * d'origine : une plaque carrée de 96 px à gauche du mot-clé « PROXIMA ».
 * `clear` est la zone effacée avant redessin — plus large que la marque, pour
 * que rejouer le script ne laisse aucun résidu de la version précédente.
 */
const OG = {
  width: 1200,
  height: 630,
  mark: { x: 96, y: 150, size: 96 },
  clear: { x0: 90, y0: 142, x1: 206, y1: 254 },
};

/**
 * Efface la zone `clear` en interpolant le fond depuis ses bords immédiats.
 *
 * Le fond de l'aperçu est un dégradé linéaire lisse : l'interpolation bilinéaire
 * entre les quatre lignes qui bordent la zone le reconstruit à l'identique, sans
 * qu'on ait à connaître ni son angle ni ses couleurs.
 */
function inpaint(img, box) {
  const { x0, y0, x1, y1 } = box;
  const at = (x, y) => {
    const i = (y * img.width + x) * 4;
    return [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]];
  };
  const left = [], right = [], top = [], bottom = [];
  for (let y = y0; y <= y1; y++) { left.push(at(x0 - 1, y)); right.push(at(x1 + 1, y)); }
  for (let x = x0; x <= x1; x++) { top.push(at(x, y0 - 1)); bottom.push(at(x, y1 + 1)); }

  for (let y = y0; y <= y1; y++) {
    const fy = (y - y0 + 1) / (y1 - y0 + 2);
    for (let x = x0; x <= x1; x++) {
      const fx = (x - x0 + 1) / (x1 - x0 + 2);
      const d = (y * img.width + x) * 4;
      for (let k = 0; k < 3; k++) {
        const horizontal = left[y - y0][k] * (1 - fx) + right[y - y0][k] * fx;
        const vertical = top[x - x0][k] * (1 - fy) + bottom[x - x0][k] * fy;
        img.rgba[d + k] = Math.round((horizontal + vertical) / 2);
      }
      img.rgba[d + 3] = 255;
    }
  }
}

/** Garde-fou : la zone à effacer ne doit contenir que du fond et l'ancienne marque. */
function assertClearZoneIsFree(img, box) {
  // Bande droite de la zone effacée : elle borde le mot-clé « PROXIMA ». Un
  // pixel clair ici signifierait que la maquette a bougé et que l'effacement
  // mordrait sur la typographie.
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = OG.mark.x + OG.mark.size + 4; x <= box.x1; x++) {
      const i = (y * img.width + x) * 4;
      const luma = 0.2126 * img.rgba[i] + 0.7152 * img.rgba[i + 1] + 0.0722 * img.rgba[i + 2];
      if (luma > 120) {
        throw new Error(
          `og-image.png : pixel clair inattendu en (${x}, ${y}) — la maquette a changé, `
          + 'ajuster la constante OG avant de régénérer',
        );
      }
    }
  }
}

/* ========================================================================== */
/*  Programme                                                                 */
/* ========================================================================== */

const report = [];
function write(name, buffer) {
  const file = path.join(PUBLIC_DIR, name);
  const before = fs.existsSync(file) ? fs.statSync(file).size : null;
  fs.writeFileSync(file, buffer);
  report.push({ name, before, after: buffer.length });
}

const raw = decode(SOURCE);
console.log(`source : ${path.relative(process.cwd(), SOURCE)} — ${raw.width}×${raw.height}`);

// 1. Normalisation : la forme est recadrée sur son encre puis recentrée dans un
//    carré de 1024. C'est ce qui rend le script idempotent — relancé sur sa
//    propre sortie, il retrouve la même boîte et la remet au même endroit.
//    Jamais d'agrandissement : la définition utile du logo est celle de l'export
//    d'origine, l'étirer ne créerait que du flou et un tracé en escalier.
const MASTER_SIZE = 1024;
const MASTER_MARGIN = 0.04;
const master = renderMark(raw, inkBounds(raw), MASTER_SIZE, { margin: MASTER_MARGIN, noUpscale: true });
const box = inkBounds(master);
console.log(`marque normalisée : ${box.width}×${box.height} dans ${MASTER_SIZE}×${MASTER_SIZE}`);

// 2. Référence pleine résolution (JSON-LD Organization la déclare en 1024×1024).
write('logo.png', encode(master));

// 3. Vectoriel — l'asset réellement servi à l'interface et au favicon.
const { svg, points, stops } = buildSvg(master, box);
write('logo.svg', Buffer.from(svg, 'utf8'));
console.log(`tracé : ${points} points · dégradé ${stops.map((s) => s.color).join(' → ')}`);

// 4. Icônes. Marges : les icônes « any » gardent une respiration, la maskable
//    reste dans la zone sûre centrale d'Android (80 % du côté), l'apple-touch
//    suit la convention iOS d'une marque un peu rentrée sur fond plein.
// Le favicon est plus serré que les autres : à 16 px, chaque pixel de marge
// mangerait 6 % de la hauteur de la marque.
write('favicon.png', encode(renderMark(master, box, 32, { margin: 0.02 })));
write('icon-192.png', encode(renderMark(master, box, 192, { margin: ICON_MARGIN })));
write('icon-512.png', encode(renderMark(master, box, 512, { margin: ICON_MARGIN })));
write('icon-maskable-512.png', encode(renderMark(master, box, 512, { margin: 0.22, plate: PLATE }), { alpha: false }));
write('apple-touch-icon.png', encode(renderMark(master, box, 180, { margin: 0.14, plate: PLATE }), { alpha: false }));

// 5. Aperçu de lien : on remplace la marque sans toucher à la typographie.
const ogFile = path.join(PUBLIC_DIR, 'og-image.png');
if (fs.existsSync(ogFile)) {
  const og = decode(ogFile);
  if (og.width !== OG.width || og.height !== OG.height) {
    throw new Error(`og-image.png : ${og.width}×${og.height} au lieu de ${OG.width}×${OG.height}`);
  }
  assertClearZoneIsFree(og, OG.clear);
  inpaint(og, OG.clear);
  const scale = OG.mark.size / Math.max(box.width, box.height);
  const markW = Math.round(box.width * scale);
  const markH = Math.round(box.height * scale);
  composite(
    og,
    resample(master, box, markW, markH),
    OG.mark.x,
    OG.mark.y + Math.round((OG.mark.size - markH) / 2),
  );
  write('og-image.png', encode(og, { alpha: false }));
}

const kb = (n) => (n / 1024).toFixed(1).replace('.', ',') + ' Ko';
console.log('\nfichier                    avant      après');
for (const r of report) {
  console.log(
    r.name.padEnd(24),
    (r.before === null ? '—' : kb(r.before)).padStart(9),
    kb(r.after).padStart(10),
    r.before && r.after < r.before ? `  −${Math.round((1 - r.after / r.before) * 100)} %` : '',
  );
}
