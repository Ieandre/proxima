import { describe, expect, it } from 'vitest';
import { hasThread, peerFromMember, splitPeople, type SplitInput } from '../src/lib/people';
import type { Person } from '../src/lib/types';

/**
 * Répartition des personnes dans la barre latérale (design 2026-08-03).
 *
 * L'invariant central — « une conversation ne change jamais de liste quand son
 * correspondant se déplace » — est le pendant, pour les personnes, de celui que
 * `rooms.test.ts` verrouille pour les salons (« ne déplace PAS un salon quand on y
 * entre / en sort »).
 */

const person = (id: string, pseudo = id): Person =>
  ({
    id,
    pseudo,
    age: 30,
    gender: 'A',
    city: 'Paris',
    region: '',
    country: 'FR',
    countryLabel: 'France',
    pub: `PUB_${id}`,
  }) as Person;

const byId = (...list: Person[]) => Object.fromEntries(list.map((p) => [p.id, p]));
const withThread = (...ids: string[]): SplitInput['threads'] =>
  Object.fromEntries(ids.map((id) => [`pm:${id}`, [{ text: 'coucou' }]]));

describe('hasThread', () => {
  it('vrai dès un message, faux sur un fil absent ou vide', () => {
    expect(hasThread(withThread('a'), 'a')).toBe(true);
    expect(hasThread({}, 'a')).toBe(false);
    expect(hasThread({ 'pm:a': [] }, 'a')).toBe(false);
  });
});

describe('splitPeople — répartition', () => {
  it('une personne présente sans fil va dans « À proximité »', () => {
    const { conversations, nearby } = splitPeople({ people: byId(person('a')), pmPeers: {}, threads: {} });
    expect(nearby.map((p) => p.id)).toEqual(['a']);
    expect(conversations).toEqual([]);
  });

  it('une personne présente AVEC un fil va dans « Conversations », et quitte « À proximité »', () => {
    const { conversations, nearby } = splitPeople({
      people: byId(person('a')),
      pmPeers: {},
      threads: withThread('a'),
    });
    expect(conversations.map((p) => p.id)).toEqual(['a']);
    expect(nearby).toEqual([]);
  });

  it('un correspondant absent avec un fil reste dans « Conversations »', () => {
    const { conversations, nearby } = splitPeople({
      people: {},
      pmPeers: byId(person('a')),
      threads: withThread('a'),
    });
    expect(conversations.map((p) => p.id)).toEqual(['a']);
    expect(nearby).toEqual([]);
  });

  it('un correspondant mémorisé SANS fil n’apparaît nulle part', () => {
    // Souvenir sans conversation : rien à afficher, ni ici ni là.
    const { conversations, nearby } = splitPeople({ people: {}, pmPeers: byId(person('a')), threads: {} });
    expect(conversations).toEqual([]);
    expect(nearby).toEqual([]);
  });

  it('jamais dans les deux listes à la fois', () => {
    const { conversations, nearby } = splitPeople({
      people: byId(person('a'), person('b')),
      pmPeers: {},
      threads: withThread('a'),
    });
    const ids = [...conversations, ...nearby].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(['a', 'b']);
  });
});

describe('splitPeople — l’invariant : rien ne bouge quand l’autre se déplace', () => {
  it('ne déplace PAS une conversation quand le correspondant quitte le rayon', () => {
    const a = person('a', 'Alice');
    const threads = withThread('a');

    // Présent : la conversation est dans « Conversations ».
    const ici = splitPeople({ people: byId(a), pmPeers: byId(a), threads });
    // Il s'éloigne : `people` le perd, le souvenir reste.
    const parti = splitPeople({ people: {}, pmPeers: byId(a), threads });

    expect(ici.conversations.map((p) => p.id)).toEqual(['a']);
    expect(parti.conversations.map((p) => p.id)).toEqual(['a']);
    expect(parti.nearby).toEqual([]);
  });

  it('ne déplace PAS une conversation quand le correspondant revient', () => {
    const a = person('a', 'Alice');
    const threads = withThread('a');
    const parti = splitPeople({ people: {}, pmPeers: byId(a), threads });
    const revenu = splitPeople({ people: byId(a), pmPeers: byId(a), threads });

    expect(parti.conversations.map((p) => p.id)).toEqual(revenu.conversations.map((p) => p.id));
    expect(revenu.nearby).toEqual([]);
  });

  it('l’ordre ne dépend pas de la présence : seul le pseudo le fixe', () => {
    const zoe = person('z', 'Zoé');
    const alice = person('a', 'Alice');
    const threads = withThread('z', 'a');

    const tous = splitPeople({ people: byId(zoe, alice), pmPeers: byId(zoe, alice), threads });
    const aucun = splitPeople({ people: {}, pmPeers: byId(zoe, alice), threads });

    expect(tous.conversations.map((p) => p.pseudo)).toEqual(['Alice', 'Zoé']);
    expect(aucun.conversations.map((p) => p.pseudo)).toEqual(['Alice', 'Zoé']);
  });
});

describe('peerFromMember — correspondant né d’un salon', () => {
  it('porte le pseudo et la clé, et rien de géographique', () => {
    const peer = peerFromMember({ id: 'm1', pseudo: 'Bob', pub: 'PUB_BOB' });
    expect(peer.pseudo).toBe('Bob');
    expect(peer.pub).toBe('PUB_BOB');
    // Ville vide = « hors de portée » à l'écran, ce qui est exact : le serveur ne
    // divulgue pas la géographie d'un co-présent (cf. `pm:key`).
    expect(peer.city).toBe('');
  });

  it('s’efface devant le profil présent, qui est complet', () => {
    const reduit = peerFromMember({ id: 'a', pseudo: 'Alice', pub: 'PUB_a' });
    const { conversations } = splitPeople({
      people: byId(person('a', 'Alice')),
      pmPeers: byId(reduit),
      threads: withThread('a'),
    });
    expect(conversations[0].city).toBe('Paris');
  });
});

describe('splitPeople — fraîcheur du profil', () => {
  it('le profil présent prime sur le souvenir (ville et âge à jour)', () => {
    const souvenir = { ...person('a'), city: 'Lille', age: 20 } as Person;
    const vivant = { ...person('a'), city: 'Paris', age: 31 } as Person;
    const { conversations } = splitPeople({
      people: byId(vivant),
      pmPeers: byId(souvenir),
      threads: withThread('a'),
    });
    expect(conversations[0].city).toBe('Paris');
    expect(conversations[0].age).toBe(31);
  });

  it('le souvenir sert de repli quand la personne n’est plus là', () => {
    const souvenir = { ...person('a'), city: 'Lille' } as Person;
    const { conversations } = splitPeople({ people: {}, pmPeers: byId(souvenir), threads: withThread('a') });
    expect(conversations[0].city).toBe('Lille');
  });
});
