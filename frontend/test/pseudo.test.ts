import { describe, expect, it } from 'vitest';
import { ESPACE_DE_TIRAGE, randomPseudo } from '../src/lib/pseudo';

describe('randomPseudo', () => {
  it('produit un pseudo accepté par le formulaire et par `identify`', () => {
    // 2 caractères minimum, 24 maximum : les deux bornes du serveur (socket.js).
    for (let i = 0; i < 500; i++) {
      const p = randomPseudo();
      expect(p.length).toBeGreaterThanOrEqual(2);
      expect(p.length).toBeLessThanOrEqual(24);
      expect(p.trim()).toBe(p);
    }
  });

  it('ne produit que des lettres — ni chiffre, ni séparateur', () => {
    // Un pseudo attribué doit rester habitable : « Anonyme4821 » se lirait comme
    // un identifiant machine, ce que le service n'est pas.
    for (let i = 0; i < 500; i++) {
      expect(randomPseudo()).toMatch(/^\p{L}+$/u);
    }
  });

  it('offre un espace de tirage assez large pour que l’homonymie reste rare', () => {
    // Rien n'impose l'unicité d'un pseudo (cf. mentions.ts) : c'est la taille du
    // tirage qui tient l'homonymie à distance. À 12 000 combinaisons, un salon de
    // 30 personnes a moins de 4 % de risque de compter deux pseudos identiques.
    expect(ESPACE_DE_TIRAGE).toBeGreaterThanOrEqual(12000);
  });

  it('varie d’un tirage à l’autre', () => {
    const tirages = new Set(Array.from({ length: 200 }, () => randomPseudo()));
    expect(tirages.size).toBeGreaterThan(150);
  });
});
