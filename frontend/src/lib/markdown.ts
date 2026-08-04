/**
 * Balisage léger des messages, à la Discord.
 *
 * Le texte part sur le fil **tel qu'il a été tapé** : aucun balisage n'est
 * transformé avant l'envoi, rien n'est ajouté à l'enveloppe. L'interprétation
 * vit entièrement à l'affichage, comme la reconnaissance des mentions
 * (cf. `lib/mentions.ts`) — le serveur ne voit donc jamais qu'un message était
 * en gras, et la modération continue de lire exactement ce qui a été envoyé.
 *
 * Conséquence assumée : ce module rend un **arbre**, jamais du HTML. Pas de
 * chaîne à réinjecter, donc rien à assainir — le seul moyen de faire du gras est
 * de produire un nœud `b`, et un `<script>` tapé dans un message reste du texte
 * puisque React l'échappe. La CSP l'interdirait de toute façon.
 *
 * Ce qui est reconnu (et rien d'autre) :
 *
 * - `**gras**`, `*italique*` ou `_italique_`, `***les deux***`
 * - `__souligné__`, `~~barré~~`
 * - `` `code` `` en ligne, et un bloc de code entre lignes de trois barrières
 *   (avec un nom de langage optionnel, conservé mais pas coloré)
 * - `> ` en tête de ligne : citation, les lignes voisines se rejoignant en une
 * - `||spoiler||` : masqué jusqu'au clic
 * - `\*` : l'astérisque littérale, pour écrire un marqueur sans l'invoquer
 *
 * Volontairement absents : les titres (une bulle de chat n'a pas de sections),
 * les images (rien ne doit pouvoir charger une URL tierce depuis un message : la
 * CSP le bloque et cela divulguerait l'IP du lecteur), et les liens
 * `[texte](url)` — un libellé qui masque sa destination est une arme dans un
 * salon anonyme.
 */

/** Styles qui portent d'autres nœuds : gras, italique, souligné, barré, masqué. */
export type Style = 'b' | 'i' | 'u' | 's' | 'spoiler';

export type Inline = { t: 'text'; v: string } | { t: 'code'; v: string } | { t: Style; kids: Inline[] };

export type Block =
  | { t: 'p'; kids: Inline[] }
  | { t: 'quote'; kids: Inline[] }
  | { t: 'pre'; v: string; lang?: string };

/** Marqueurs qu'une contre-oblique rend littéraux. */
const ESCAPABLE = '*_~`|\\>';

/**
 * Marqueurs de style, **du plus long au plus court** : sans cet ordre, `**` se
 * lirait `*` puis `*`. Certains en emboîtent deux — `***mot***` est le gras et
 * l'italique à la fois, comme partout ailleurs.
 */
const DELIMS: Array<{ mark: string; wrap: Style[] }> = [
  { mark: '***', wrap: ['b', 'i'] },
  { mark: '**', wrap: ['b'] },
  { mark: '___', wrap: ['u', 'i'] },
  { mark: '__', wrap: ['u'] },
  { mark: '~~', wrap: ['s'] },
  { mark: '||', wrap: ['spoiler'] },
  { mark: '*', wrap: ['i'] },
  { mark: '_', wrap: ['i'] },
];

/**
 * Profondeur d'imbrication au-delà de laquelle les marqueurs redeviennent du
 * texte. Un message n'emboîte pas huit niveaux de style ; en revanche une suite
 * de `*` tapée au hasard, elle, descendrait aussi loin que sa longueur.
 */
const MAX_DEPTH = 8;

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
const isSpace = (c: string | undefined) => !c || /\s/.test(c);

const FENCE = /^```([A-Za-z0-9+#.\-_]{0,20})[ \t]*$/;
const QUOTE = /^>(?: |$)/;

/**
 * Découpe un message en blocs. Un texte sans balisage rend **un seul** bloc dont
 * le texte est identique à l'original : l'affichage reste alors exactement ce
 * qu'il était, retours à la ligne compris (la bulle est en `pre-wrap`).
 */
export function parseMarkdown(text: string): Block[] {
  if (!text) return [];
  const lines = text.split('\n');
  const out: Block[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (!para.length) return;
    out.push({ t: 'p', kids: parseInline(para.join('\n'), 0) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const fence = FENCE.exec(lines[i]);
    if (fence) {
      // Une ouverture sans fermeture ne mange pas la fin du message : faute de
      // clôture, la ligne de barrières redevient du texte ordinaire.
      const close = lines.indexOf('```', i + 1);
      if (close > i) {
        flushPara();
        const body = lines.slice(i + 1, close).join('\n');
        out.push(fence[1] ? { t: 'pre', v: body, lang: fence[1] } : { t: 'pre', v: body });
        i = close;
        continue;
      }
    }
    if (QUOTE.test(lines[i])) {
      flushPara();
      // Lignes citées consécutives : une seule citation, pas une par ligne.
      const start = i;
      while (i + 1 < lines.length && QUOTE.test(lines[i + 1])) i++;
      const body = lines
        .slice(start, i + 1)
        .map((l) => l.replace(QUOTE, ''))
        .join('\n');
      out.push({ t: 'quote', kids: parseInline(body, 0) });
      continue;
    }
    para.push(lines[i]);
  }
  flushPara();
  return out;
}

/** Contenu d'un bloc : suite de nœuds de style, de code et de texte. */
function parseInline(src: string, depth: number): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => {
    if (buf) {
      out.push({ t: 'text', v: buf });
      buf = '';
    }
  };

  let i = 0;
  while (i < src.length) {
    const c = src[i];

    // `next` doit être testé pour lui-même : toute chaîne « contient » la chaîne
    // vide, et une contre-oblique en fin de message échapperait le néant.
    const next = src[i + 1];
    if (c === '\\' && next && ESCAPABLE.includes(next)) {
      buf += next;
      i += 2;
      continue;
    }

    // Le code en ligne se ferme sur une série de barrières de même longueur, ce
    // qui laisse écrire une barrière dans du code (``a ` b``). Son contenu n'est
    // jamais réinterprété : c'est la seule façon de montrer du balisage.
    if (c === '`') {
      const run = runLength(src, i, '`');
      const close = findRun(src, i + run, '`', run);
      if (close >= 0) {
        flush();
        out.push({ t: 'code', v: src.slice(i + run, close) });
        i = close + run;
        continue;
      }
    }

    const found = depth < MAX_DEPTH ? matchDelim(src, i) : null;
    if (found) {
      flush();
      // Emboîtement de l'intérieur vers l'extérieur : `***mot***` donne un gras
      // qui porte un italique.
      let kids = parseInline(found.inner, depth + 1);
      for (let k = found.wrap.length - 1; k >= 0; k--) kids = [{ t: found.wrap[k], kids }];
      out.push(kids[0]);
      i = found.end;
      continue;
    }

    buf += c;
    i++;
  }
  flush();
  return out;
}

/**
 * Marqueur de style ouvert en `i` et refermé plus loin, ou `null`.
 *
 * Trois garde-fous reprennent l'usage courant plutôt que la lettre de Markdown :
 * le contenu ne peut pas commencer ni finir par un blanc — sans quoi « 3 * 4 et
 * 5 * 6 » passerait en italique —, un `_` collé à un mot reste inerte pour que
 * `nom_de_variable` s'affiche tel quel, et la fermeture doit être une série de
 * même longueur que l'ouverture : `**a ** b` n'est alors rien du tout, là où un
 * marqueur pris au milieu d'une série produirait un italique fantôme.
 */
function matchDelim(src: string, i: number): { wrap: Style[]; inner: string; end: number } | null {
  for (const { mark, wrap } of DELIMS) {
    if (!src.startsWith(mark, i)) continue;
    const ch = mark[0];
    const from = i + mark.length;
    if (isSpace(src[from])) continue;
    // Un marqueur plus long a déjà été essayé et refusé : le reste de la série
    // est du texte, pas une ouverture.
    if (src[from] === ch) continue;
    if (ch === '_' && isWordChar(src[i - 1])) continue;

    for (let j = from; (j = src.indexOf(mark, j)) >= 0; j += 1) {
      if (j === from) continue; // contenu vide
      if (isSpace(src[j - 1])) continue;
      if (src[j - 1] === ch || runLength(src, j, ch) !== mark.length) continue;
      if (ch === '_' && isWordChar(src[j + mark.length])) continue;
      return { wrap, inner: src.slice(from, j), end: j + mark.length };
    }
  }
  return null;
}

/** Longueur de la série de `ch` qui commence en `at`. */
function runLength(src: string, at: number, ch: string): number {
  let n = 0;
  while (src[at + n] === ch) n++;
  return n;
}

/** Position d'une série de `ch` d'exactement `len`, à partir de `from`, ou -1. */
function findRun(src: string, from: number, ch: string, len: number): number {
  for (let i = from; (i = src.indexOf(ch.repeat(len), i)) >= 0; ) {
    if (runLength(src, i, ch) === len) return i;
    i += runLength(src, i, ch);
  }
  return -1;
}

/**
 * Texte nu d'un message, balisage retiré — pour les aperçus (citation, barre de
 * réponse), qui n'ont pas de place pour du style et surtout pas pour ses marques.
 *
 * Un spoiler y est **masqué** : il serait absurde qu'une citation dévoile ce que
 * son auteur a pris soin de couvrir.
 */
export function plainText(text: string): string {
  return parseMarkdown(text)
    .map((b) => (b.t === 'pre' ? b.v : flatten(b.kids)))
    .join(' ')
    .trim();
}

function flatten(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      if (n.t === 'text' || n.t === 'code') return n.v;
      if (n.t === 'spoiler') return '•••';
      return flatten(n.kids);
    })
    .join('');
}
