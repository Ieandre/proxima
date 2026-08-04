import { describe, expect, it } from 'vitest';
import { parseMarkdown, plainText, type Block, type Inline } from '../src/lib/markdown';

/** Rend l'arbre en balisage compact, pour comparer une structure d'un coup d'œil. */
function show(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      if (n.t === 'text') return n.v;
      if (n.t === 'code') return `<c>${n.v}</c>`;
      return `<${n.t}>${show(n.kids)}</${n.t}>`;
    })
    .join('');
}

function inlineOf(text: string): string {
  const blocks = parseMarkdown(text);
  expect(blocks).toHaveLength(1);
  expect(blocks[0].t).toBe('p');
  return show((blocks[0] as Extract<Block, { t: 'p' }>).kids);
}

describe('parseMarkdown — texte sans balisage', () => {
  it('un texte ordinaire reste un seul bloc, mot pour mot', () => {
    const blocks = parseMarkdown('Bonjour, on se voit à 18 h ?');
    expect(blocks).toEqual([{ t: 'p', kids: [{ t: 'text', v: 'Bonjour, on se voit à 18 h ?' }] }]);
  });

  it('les retours à la ligne sont conservés dans le bloc (la bulle est en pre-wrap)', () => {
    expect(inlineOf('deux\nlignes')).toBe('deux\nlignes');
  });

  it('texte vide : aucun bloc', () => {
    expect(parseMarkdown('')).toEqual([]);
  });
});

describe('parseMarkdown — styles en ligne', () => {
  it('gras, italique, souligné, barré', () => {
    expect(inlineOf('**gras**')).toBe('<b>gras</b>');
    expect(inlineOf('*ital*')).toBe('<i>ital</i>');
    expect(inlineOf('_ital_')).toBe('<i>ital</i>');
    expect(inlineOf('__souligné__')).toBe('<u>souligné</u>');
    expect(inlineOf('~~barré~~')).toBe('<s>barré</s>');
  });

  it('`***mot***` emboîte le gras et l\'italique', () => {
    expect(inlineOf('***mot***')).toBe('<b><i>mot</i></b>');
  });

  it('imbrication libre', () => {
    expect(inlineOf('**gras et *ital* dedans**')).toBe('<b>gras et <i>ital</i> dedans</b>');
  });

  it('le style traverse les lignes d\'un même message', () => {
    expect(inlineOf('**deux\nlignes**')).toBe('<b>deux\nlignes</b>');
  });

  it('spoiler', () => {
    expect(inlineOf('||la fin||')).toBe('<spoiler>la fin</spoiler>');
  });

  it('marqueur non refermé : du texte, pas un style', () => {
    expect(inlineOf('**pas fermé')).toBe('**pas fermé');
    expect(inlineOf('un * seul')).toBe('un * seul');
  });

  it('une multiplication n\'est pas de l\'italique (blanc collé au marqueur)', () => {
    expect(inlineOf('3 * 4 et 5 * 6')).toBe('3 * 4 et 5 * 6');
    expect(inlineOf('**a ** b')).toBe('**a ** b');
  });

  it('un souligné collé à un mot reste inerte (nom_de_variable)', () => {
    expect(inlineOf('nom_de_variable')).toBe('nom_de_variable');
    expect(inlineOf('a_b_c et _vrai_')).toBe('a_b_c et <i>vrai</i>');
  });

  it('contenu vide : les marqueurs restent littéraux', () => {
    expect(inlineOf('****')).toBe('****');
    expect(inlineOf('||||')).toBe('||||');
  });

  it('la contre-oblique désarme un marqueur', () => {
    expect(inlineOf('\\**pas gras\\**')).toBe('**pas gras**');
    expect(inlineOf('a \\\\ b')).toBe('a \\ b');
    // Devant un caractère ordinaire, la contre-oblique n'est pas une échappée.
    expect(inlineOf('C:\\dossier')).toBe('C:\\dossier');
  });

  it('une suite de marqueurs ne fait pas descendre le rendu indéfiniment', () => {
    const parts = show(
      (parseMarkdown('*'.repeat(60) + 'x' + '*'.repeat(60))[0] as Extract<Block, { t: 'p' }>).kids,
    );
    // Peu importe la forme exacte : le texte utile est là et l'analyse a terminé.
    expect(parts).toContain('x');
  });
});

describe('parseMarkdown — code', () => {
  it('code en ligne', () => {
    expect(inlineOf('appelle `npm test` avant')).toBe('appelle <c>npm test</c> avant');
  });

  it('le contenu d\'un code n\'est jamais réinterprété', () => {
    expect(inlineOf('`**pas gras**`')).toBe('<c>**pas gras**</c>');
    expect(inlineOf('`@Alice`')).toBe('<c>@Alice</c>');
  });

  it('une double barrière laisse écrire une barrière', () => {
    expect(inlineOf('``a ` b``')).toBe('<c>a ` b</c>');
  });

  it('barrière non refermée : du texte', () => {
    expect(inlineOf('un ` seul')).toBe('un ` seul');
  });

  it('bloc de code entre lignes de trois barrières', () => {
    expect(parseMarkdown('```\nligne 1\nligne 2\n```')).toEqual([{ t: 'pre', v: 'ligne 1\nligne 2' }]);
  });

  it('bloc de code avec un nom de langage', () => {
    expect(parseMarkdown('```js\nconst a = 1;\n```')).toEqual([{ t: 'pre', v: 'const a = 1;', lang: 'js' }]);
  });

  it('le balisage à l\'intérieur d\'un bloc de code est laissé tel quel', () => {
    expect(parseMarkdown('```\n**gras** et > citation\n```')).toEqual([
      { t: 'pre', v: '**gras** et > citation' },
    ]);
  });

  it('bloc jamais refermé : la ligne de barrières redevient du texte', () => {
    expect(inlineOf('```\nsuite')).toBe('```\nsuite');
  });

  it('texte autour d\'un bloc de code', () => {
    const blocks = parseMarkdown('avant\n```\ncode\n```\naprès');
    expect(blocks).toEqual([
      { t: 'p', kids: [{ t: 'text', v: 'avant' }] },
      { t: 'pre', v: 'code' },
      { t: 'p', kids: [{ t: 'text', v: 'après' }] },
    ]);
  });
});

describe('parseMarkdown — citations', () => {
  it('une ligne citée', () => {
    expect(parseMarkdown('> cité')).toEqual([{ t: 'quote', kids: [{ t: 'text', v: 'cité' }] }]);
  });

  it('lignes citées consécutives : une seule citation', () => {
    expect(parseMarkdown('> une\n> deux')).toEqual([{ t: 'quote', kids: [{ t: 'text', v: 'une\ndeux' }] }]);
  });

  it('la citation garde son balisage', () => {
    expect(parseMarkdown('> **fort**')).toEqual([
      { t: 'quote', kids: [{ t: 'b', kids: [{ t: 'text', v: 'fort' }] }] },
    ]);
  });

  it('un « > » au milieu d\'une ligne ne cite rien', () => {
    expect(inlineOf('3 > 2')).toBe('3 > 2');
  });

  it('réponse sous une citation', () => {
    expect(parseMarkdown('> sa phrase\nma réponse')).toEqual([
      { t: 'quote', kids: [{ t: 'text', v: 'sa phrase' }] },
      { t: 'p', kids: [{ t: 'text', v: 'ma réponse' }] },
    ]);
  });
});

describe('plainText', () => {
  it('retire le balisage', () => {
    expect(plainText('**gras** et `code` et *ital*')).toBe('gras et code et ital');
  });

  it('masque un spoiler : un aperçu ne dévoile pas ce qui était couvert', () => {
    expect(plainText('la fin : ||il meurt||')).toBe('la fin : •••');
  });

  it('aplatit citations et blocs de code', () => {
    expect(plainText('> cité\nréponse')).toBe('cité réponse');
    expect(plainText('```\ncode\n```')).toBe('code');
  });

  it('texte sans balisage : inchangé', () => {
    expect(plainText('Bonjour à tous')).toBe('Bonjour à tous');
  });

  it('texte vide : chaîne vide', () => {
    expect(plainText('')).toBe('');
  });
});
