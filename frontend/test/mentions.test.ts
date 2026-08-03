import { describe, expect, it } from 'vitest';
import { applyMention, mentionQuery, mentionsPseudo, splitMentions } from '../src/lib/mentions';

const PRESENTS = ['Alice', 'Bob', 'Jean Pierre', 'Ali'];

/** Raccourci de lecture : la suite des pseudos reconnus dans l'ordre. */
const found = (text: string, pseudos = PRESENTS) =>
  splitMentions(text, pseudos).filter((s) => s.pseudo).map((s) => s.pseudo);

describe('découpage des mentions', () => {
  it('reconnaît une mention isolée', () => {
    expect(splitMentions('@Alice tu viens ?', PRESENTS)).toEqual([
      { text: '@Alice', pseudo: 'Alice' },
      { text: ' tu viens ?' },
    ]);
  });

  it('reconnaît plusieurs mentions et conserve le texte intact', () => {
    const parts = splitMentions('salut @Alice et @Bob !', PRESENTS);
    expect(parts.map((p) => p.text).join('')).toBe('salut @Alice et @Bob !');
    expect(found('salut @Alice et @Bob !')).toEqual(['Alice', 'Bob']);
  });

  it('un pseudo inconnu reste du texte ordinaire', () => {
    expect(found('@Charlie es-tu là ?')).toEqual([]);
  });

  it('le pseudo le plus long gagne (« Ali » ne vole pas « Alice »)', () => {
    expect(found('@Alice')).toEqual(['Alice']);
    expect(found('@Ali')).toEqual(['Ali']);
  });

  it('ne mord pas sur un mot plus long (« @Alicia » ne mentionne personne)', () => {
    expect(found('@Alicia')).toEqual([]);
  });

  it('gère un pseudo contenant une espace', () => {
    expect(found('merci @Jean Pierre pour le tuyau')).toEqual(['Jean Pierre']);
  });

  it('une adresse e-mail n\'est pas une mention', () => {
    expect(found('écris à contact@Alice.example')).toEqual([]);
  });

  it('insensible à la casse, mais l\'affichage garde la frappe', () => {
    const parts = splitMentions('@alice ?', PRESENTS);
    expect(parts[0]).toEqual({ text: '@alice', pseudo: 'Alice' });
  });

  it('suit la ponctuation collée', () => {
    expect(found('(@Bob), tu confirmes ?')).toEqual(['Bob']);
  });

  it('sans présent à reconnaître, le texte sort d\'un bloc', () => {
    expect(splitMentions('@Alice', [])).toEqual([{ text: '@Alice' }]);
  });
});

describe('suis-je interpellé·e ?', () => {
  it('vrai sur mon pseudo, faux sur celui d\'un autre', () => {
    expect(mentionsPseudo('@Alice on y va', 'Alice')).toBe(true);
    expect(mentionsPseudo('@Alice on y va', 'Bob')).toBe(false);
  });

  it('faux quand le pseudo est cité sans « @ »', () => {
    expect(mentionsPseudo('Alice a raison', 'Alice')).toBe(false);
  });
});

describe('mention en cours de frappe', () => {
  it('détecte le « @ » ouvert à gauche du curseur', () => {
    expect(mentionQuery('salut @ali', 10)).toEqual({ start: 6, query: 'ali' });
  });

  it('un « @ » seul ouvre une requête vide (toute la liste)', () => {
    expect(mentionQuery('@', 1)).toEqual({ start: 0, query: '' });
  });

  it('s\'arrête au blanc : on ne traverse pas les mots', () => {
    expect(mentionQuery('@ali oui', 8)).toBe(null);
  });

  it('un « @ » collé à un mot n\'ouvre rien (e-mail)', () => {
    expect(mentionQuery('contact@ali', 11)).toBe(null);
  });

  it('ignore ce qui suit le curseur', () => {
    expect(mentionQuery('@al reste', 3)).toEqual({ start: 0, query: 'al' });
  });
});

describe('insertion du pseudo choisi', () => {
  it('remplace la frappe par le pseudo complet suivi d\'une espace', () => {
    expect(applyMention('salut @ali', 6, 10, 'Alice')).toEqual({ text: 'salut @Alice ', caret: 13 });
  });

  it('insère au milieu d\'une phrase sans toucher à la suite', () => {
    const r = applyMention('dis @je que oui', 4, 7, 'Jean Pierre');
    expect(r.text).toBe('dis @Jean Pierre  que oui');
    expect(r.text.slice(0, r.caret)).toBe('dis @Jean Pierre ');
  });
});
