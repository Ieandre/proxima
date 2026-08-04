import { describe, expect, it } from 'vitest';
import { buildRoomList, communityStart, filterRooms, normalize } from '../src/lib/rooms';
import type { JoinedRoom, RoomSummary } from '../src/lib/types';

const summary = (id: string, over: Partial<RoomSummary> = {}): RoomSummary => ({
  id,
  name: `Salon ${id}`,
  type: 'public',
  count: 1,
  ...over,
});

const joined = (id: string, members = 1, over: Partial<JoinedRoom> = {}): JoinedRoom =>
  ({
    id,
    name: `Salon ${id}`,
    type: 'public',
    hasPassword: false,
    owner: 'me',
    members: Array.from({ length: members }, (_, i) => ({ id: `u${i}`, pseudo: `U${i}` })),
    ...over,
  }) as JoinedRoom;

const ids = (list: { id: string }[]) => list.map((e) => e.id);

describe('buildRoomList — composition', () => {
  it('fusionne annuaire et salons rejoints sans doublon', () => {
    const list = buildRoomList({
      publicRooms: [summary('a'), summary('b')],
      joinedRooms: { a: joined('a') },
      homeRoom: null,
    });
    expect(ids(list).sort()).toEqual(['a', 'b']);
    expect(list.find((e) => e.id === 'a')!.here).toBe(true);
    expect(list.find((e) => e.id === 'b')!.here).toBe(false);
  });

  it('porte les salons privés, absents de l\'annuaire public', () => {
    const list = buildRoomList({
      publicRooms: [],
      joinedRooms: { p: joined('p', 2, { type: 'private' }) },
      homeRoom: null,
    });
    expect(list).toHaveLength(1);
    expect(list[0].private).toBe(true);
  });

  it('conserve le salon de région après en être sorti (hors annuaire public)', () => {
    const list = buildRoomList({
      publicRooms: [summary('a')],
      joinedRooms: {},
      homeRoom: { id: 'rgn-fr-11', name: 'Île-de-France' },
    });
    const region = list.find((e) => e.id === 'rgn-fr-11');
    expect(region).toBeDefined();
    expect(region!.here).toBe(false);
    expect(region!.name).toBe('Île-de-France');
    // Hors annuaire : le nombre de présents est inconnu, pas nul.
    expect(region!.count).toBe(null);
  });

  it('compte les présents depuis la composition quand on est dans le salon', () => {
    const list = buildRoomList({
      publicRooms: [summary('a', { count: 99 })], // annuaire en retard
      joinedRooms: { a: joined('a', 3) },
      homeRoom: null,
    });
    expect(list[0].count).toBe(3);
  });

  it('marque « alone » le salon éphémère où l\'on est seul (RG-05), jamais un permanent', () => {
    const list = buildRoomList({
      publicRooms: [summary('a'), summary('o', { persistent: true })],
      joinedRooms: { a: joined('a', 1), o: joined('o', 1) },
      homeRoom: null,
    });
    expect(list.find((e) => e.id === 'a')!.alone).toBe(true);
    expect(list.find((e) => e.id === 'o')!.alone).toBe(false);
  });
});

describe('buildRoomList — ordre', () => {
  it('range région, puis officiels, puis le reste', () => {
    const list = buildRoomList({
      publicRooms: [summary('z'), summary('o', { persistent: true })],
      joinedRooms: {},
      homeRoom: { id: 'rgn-fr-11', name: 'Île-de-France' },
    });
    expect(ids(list)).toEqual(['rgn-fr-11', 'o', 'z']);
  });

  it('classe par nombre de présents décroissant dans une strate', () => {
    const list = buildRoomList({
      publicRooms: [summary('petit', { count: 2 }), summary('gros', { count: 40 })],
      joinedRooms: {},
      homeRoom: null,
    });
    expect(ids(list)).toEqual(['gros', 'petit']);
  });

  it('départage par nom à égalité de présents', () => {
    const list = buildRoomList({
      publicRooms: [summary('b', { name: 'Bravo', count: 5 }), summary('a', { name: 'Alpha', count: 5 })],
      joinedRooms: {},
      homeRoom: null,
    });
    expect(ids(list)).toEqual(['a', 'b']);
  });

  /* La régression que toute la refonte cherche à empêcher : la ligne doit rester
     exactement où elle est quand on entre dans le salon. Le compte passe de 3 à 4
     et dépasserait celui du voisin si le tri portait sur le compte brut. */
  it('ne déplace PAS un salon quand on y entre', () => {
    const before = buildRoomList({
      publicRooms: [summary('haut', { count: 4 }), summary('bas', { count: 3 })],
      joinedRooms: {},
      homeRoom: null,
    });
    expect(ids(before)).toEqual(['haut', 'bas']);

    // On entre dans « bas » : le serveur rediffuse l'annuaire avec un présent de plus.
    const after = buildRoomList({
      publicRooms: [summary('haut', { count: 4 }), summary('bas', { count: 4 })],
      joinedRooms: { bas: joined('bas', 4) },
      homeRoom: null,
    });
    expect(ids(after)).toEqual(['haut', 'bas']);
  });

  it('ne déplace PAS un salon quand on en sort', () => {
    const inside = buildRoomList({
      publicRooms: [summary('haut', { count: 5 }), summary('bas', { count: 5 })],
      joinedRooms: { bas: joined('bas', 5) },
      homeRoom: null,
    });
    const outside = buildRoomList({
      publicRooms: [summary('haut', { count: 5 }), summary('bas', { count: 4 })],
      joinedRooms: {},
      homeRoom: null,
    });
    expect(ids(inside)).toEqual(ids(outside));
  });
});

describe('filterRooms', () => {
  const list = buildRoomList({
    publicRooms: [summary('a', { name: 'Café des sports' }), summary('b', { name: 'Étudiants' })],
    joinedRooms: { c: joined('c', 2, { name: 'Cinéma' }) },
    homeRoom: null,
  });

  it('recherche sans tenir compte des accents ni de la casse', () => {
    expect(ids(filterRooms(list, { query: 'etudiants' }))).toEqual(['b']);
    expect(ids(filterRooms(list, { query: 'CAFÉ' }))).toEqual(['a']);
  });

  it('restreint aux salons où l\'on est', () => {
    expect(ids(filterRooms(list, { hereOnly: true }))).toEqual(['c']);
  });

  it('rend la liste entière sans critère', () => {
    expect(filterRooms(list, {})).toHaveLength(3);
  });
});

describe('communityStart', () => {
  const list = (over: Partial<RoomSummary>[] = [], homeRoom = null as null | { id: string; name: string }) =>
    buildRoomList({
      publicRooms: over.map((o, i) => summary(o.id || `s${i}`, o)),
      joinedRooms: {},
      homeRoom,
    });

  it('pointe la première ligne non permanente', () => {
    const rooms = list([
      { id: 'o1', persistent: true },
      { id: 'o2', persistent: true },
      { id: 'a' },
      { id: 'b' },
    ]);
    expect(communityStart(rooms)).toBe(2);
    expect(rooms[2].id).toBe('a');
  });

  it('compte le salon de région parmi les permanents', () => {
    const rooms = list([{ id: 'a' }], { id: 'rgn-fr-11', name: 'Île-de-France' });
    expect(communityStart(rooms)).toBe(1);
  });

  /* Pas de frontière à montrer quand un seul des deux côtés existe : le repère
     n'aurait rien à séparer, et il annoncerait un groupe vide. */
  it('rend -1 sans aucun salon permanent', () => {
    expect(communityStart(list([{ id: 'a' }, { id: 'b' }]))).toBe(-1);
  });

  it('rend -1 sans aucun salon de visiteur', () => {
    expect(communityStart(list([{ id: 'o', persistent: true }]))).toBe(-1);
  });

  it('rend -1 sur une liste vide', () => {
    expect(communityStart([])).toBe(-1);
  });

  /* Le repère se calcule sur la liste visible : un filtre qui ne laisse qu'un côté
     l'emporte avec lui, sans que la vue ait à s'en occuper. */
  it("suit le filtre qui vide l'un des deux côtés", () => {
    const rooms = list([
      { id: 'o', name: 'Général', persistent: true },
      { id: 'a', name: 'Soirée à Metz' },
    ]);
    expect(communityStart(rooms)).toBe(1);
    expect(communityStart(filterRooms(rooms, { query: 'metz' }))).toBe(-1);
    expect(communityStart(filterRooms(rooms, { query: 'général' }))).toBe(-1);
  });
});

describe('normalize', () => {
  it('retire accents et casse', () => {
    expect(normalize('Île-de-Francé')).toBe('ile-de-france');
  });
});
