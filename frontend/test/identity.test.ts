import { beforeEach, describe, expect, it } from 'vitest';
import { forgetIdentity, recallIdentity, rememberIdentity } from '../src/lib/identity';

/* L'environnement de test est `node` (cf. vitest.config.ts) : pas de DOM, donc pas
   de sessionStorage. On en pose un, minimal — le module ne demande rien de plus. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const VALIDE = { pseudo: 'MésangeTranquille', age: 31, gender: 'A', city: 'Metz', cityId: 'FR-57463' } as const;

describe('mémoire d’onglet de l’identité', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'sessionStorage', { value: fakeStorage(), configurable: true });
  });

  it('rend l’identité mémorisée telle quelle', () => {
    rememberIdentity({ ...VALIDE });
    expect(recallIdentity()).toEqual(VALIDE);
  });

  it('ne rend rien quand rien n’a été mémorisé', () => {
    expect(recallIdentity()).toBeNull();
  });

  it('accepte une mémoire écrite avant l’identifiant de commune', () => {
    // Onglet ouvert avant la mise à jour : le nom seul doit encore permettre la
    // reprise (le serveur retombe dessus), sans se faire renvoyer au formulaire.
    const { cityId, ...sansId } = VALIDE;
    expect(cityId).toBeTruthy();
    sessionStorage.setItem('proxima:identite', JSON.stringify(sansId));
    expect(recallIdentity()).toEqual(sansId);
  });

  it('écarte un identifiant de commune vide plutôt que de l’envoyer tel quel', () => {
    sessionStorage.setItem('proxima:identite', JSON.stringify({ ...VALIDE, cityId: '' }));
    expect(recallIdentity()).toEqual({ ...VALIDE, cityId: undefined });
  });

  it('oublie sur demande — « quitter » ne doit pas se faire ré-identifier', () => {
    rememberIdentity({ ...VALIDE });
    forgetIdentity();
    expect(recallIdentity()).toBeNull();
  });

  it('refuse une mémoire trafiquée ou tronquée plutôt que de la rejouer', () => {
    // Une valeur invalide relancerait un `identify` voué au refus : mieux vaut
    // rendre la main au formulaire.
    const invalides = [
      'pas du json',
      JSON.stringify({ ...VALIDE, pseudo: 'x' }), // trop court (2 minimum)
      JSON.stringify({ ...VALIDE, age: 17 }), // sous la majorité
      JSON.stringify({ ...VALIDE, age: 31.5 }), // non entier
      JSON.stringify({ ...VALIDE, age: 130 }), // au-delà de config.maxAge
      JSON.stringify({ ...VALIDE, gender: 'Z' }), // hors F/H/A
      JSON.stringify({ ...VALIDE, city: '' }), // sans ville, pas de géocodage
      JSON.stringify({ pseudo: 'Seule' }), // champs manquants
    ];
    for (const raw of invalides) {
      sessionStorage.setItem('proxima:identite', raw);
      expect(recallIdentity(), raw).toBeNull();
    }
  });

  it('ne casse pas quand le stockage est refusé (navigation privée)', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      get() {
        throw new Error('accès refusé');
      },
      configurable: true,
    });
    expect(() => rememberIdentity({ ...VALIDE })).not.toThrow();
    expect(recallIdentity()).toBeNull();
    expect(() => forgetIdentity()).not.toThrow();
  });
});
