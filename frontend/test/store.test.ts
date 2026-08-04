import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convKey, useStore } from '../src/store/useStore';
import { chime } from '../src/lib/sound';
import type { JoinedRoom, Person } from '../src/lib/types';

/* Sonner est un effet : on ne vérifie ici que la RÈGLE de déclenchement, la voix
   elle-même ayant sa propre suite (`sound.test.ts`). */
vi.mock('../src/lib/sound', () => ({ chime: vi.fn() }));

// Réinitialise le store entre chaque test (état global partagé).
beforeEach(() => {
  useStore.getState().reset();
});

const s = () => useStore.getState();

const person = (id: string, pseudo = id): Person =>
  ({ id, pseudo, age: 30, gender: 'A', city: 'Paris', region: '', country: 'FR', countryLabel: 'France', pub: `PUB_${id}` } as Person);

const room = (id: string): JoinedRoom =>
  ({ id, name: `Salon ${id}`, type: 'public', members: [], owner: 'me', encrypted: false } as unknown as JoinedRoom);

describe('convKey', () => {
  it('compose kind:id', () => {
    expect(convKey({ kind: 'pm', id: 'x' })).toBe('pm:x');
    expect(convKey({ kind: 'room', id: 'r1' })).toBe('room:r1');
  });
});

describe('identité & statut', () => {
  it('setMe passe le statut à live', () => {
    s().setMe(person('me'), 50);
    expect(s().status).toBe('live');
    expect(s().radiusKm).toBe(50);
    expect(s().me?.id).toBe('me');
  });

  it('updateMe change le profil sans toucher au statut ni au rayon', () => {
    // Renommage en cours de session : on est déjà « live », il ne faut pas
    // rejouer une entrée dans le service.
    s().setMe(person('me'), 50);
    s().updateMe({ ...person('me'), pseudo: 'Alicia' });
    expect(s().me?.pseudo).toBe('Alicia');
    expect(s().status).toBe('live');
    expect(s().radiusKm).toBe(50);
  });

  it('reset ramène à onboarding et vide l\'état', () => {
    s().setMe(person('me'), 50);
    s().addPerson(person('a'));
    s().reset();
    expect(s().status).toBe('onboarding');
    expect(s().me).toBe(null);
    expect(Object.keys(s().people)).toHaveLength(0);
  });
});

describe('présence', () => {
  it('setPeople indexe par id', () => {
    s().setPeople([person('a'), person('b')]);
    expect(Object.keys(s().people).sort()).toEqual(['a', 'b']);
  });

  it('addPerson / removePerson', () => {
    s().addPerson(person('a'));
    expect(s().people.a).toBeDefined();
    s().removePerson('a');
    expect(s().people.a).toBeUndefined();
  });

  it('rememberPmPeer conserve un correspondant même hors rayon', () => {
    s().rememberPmPeer(person('a'));
    expect(s().pmPeers.a.pseudo).toBe('a');
  });
});

describe('salons & clés (RG-01/02 : purge RAM)', () => {
  it('upsertJoinedRoom ajoute puis met à jour', () => {
    s().upsertJoinedRoom(room('r1'));
    expect(s().joinedRooms.r1).toBeDefined();
  });

  it('setRoomKey stocke clé + mot de passe en RAM', () => {
    const key = new Uint8Array([1, 2, 3]);
    s().setRoomKey('r1', key, 'motdepasse');
    expect(s().roomKeys.r1).toBe(key);
    expect(s().roomPasswords.r1).toBe('motdepasse');
  });

  it('setRoomMembers no-op si le salon n\'est pas rejoint', () => {
    s().setRoomMembers('inconnu', [{ id: 'a', pseudo: 'A' }], 'a');
    expect(s().joinedRooms.inconnu).toBeUndefined();
  });

  it('setRoomMembers met à jour membres + owner d\'un salon rejoint', () => {
    s().upsertJoinedRoom(room('r1'));
    s().setRoomMembers('r1', [{ id: 'a', pseudo: 'A' }], 'a');
    expect(s().joinedRooms.r1.owner).toBe('a');
    expect(s().joinedRooms.r1.members).toHaveLength(1);
  });

  it('removeJoinedRoom purge le salon, la clé, le mot de passe et l\'onglet actif', () => {
    s().upsertJoinedRoom(room('r1'));
    s().setRoomKey('r1', new Uint8Array([9]), 'pw');
    s().setActive({ kind: 'room', id: 'r1' });
    s().removeJoinedRoom('r1');
    expect(s().joinedRooms.r1).toBeUndefined();
    expect(s().roomKeys.r1).toBeUndefined();
    expect(s().roomPasswords.r1).toBeUndefined();
    expect(s().active).toBe(null); // l'onglet actif ciblait ce salon
  });
});

describe('fils de discussion & non-lus', () => {
  const K = 'pm:a';

  it('pushMessage empile et incrémente le non-lu si l\'onglet n\'est pas actif', () => {
    s().pushMessage(K, { kind: 'them', text: 'salut' } as never);
    expect(s().threads[K]).toHaveLength(1);
    expect(s().unread[K]).toBe(1);
  });

  it('un message « me » n\'incrémente jamais le non-lu', () => {
    s().pushMessage(K, { kind: 'me', text: 'moi' } as never);
    expect(s().unread[K]).toBeUndefined();
  });

  it('un message « system » (arrivée/départ) n\'incrémente jamais le non-lu', () => {
    s().pushMessage('room:r1', { kind: 'system', text: 'Bob a rejoint le salon.' } as never);
    s().pushMessage('room:r1', { kind: 'system', text: 'Bob a quitté le salon.' } as never);
    expect(s().threads['room:r1']).toHaveLength(2); // affichés dans le fil…
    expect(s().unread['room:r1']).toBeUndefined(); // …mais pas comptés
  });

  it('aucun non-lu quand l\'onglet est actif', () => {
    s().setActive({ kind: 'pm', id: 'a' });
    s().pushMessage(K, { kind: 'them', text: 'coucou' } as never);
    expect(s().unread[K]).toBeUndefined();
  });

  it('setActive efface le non-lu de la conversation ouverte', () => {
    s().pushMessage(K, { kind: 'them', text: '1' } as never);
    expect(s().unread[K]).toBe(1);
    s().setActive({ kind: 'pm', id: 'a' });
    expect(s().unread[K]).toBeUndefined();
  });

  it('retractMessage marque le message retiré (msgId) et vide son contenu', () => {
    s().pushMessage(K, { kind: 'them', text: 'à retirer', msgId: 'srv1' } as never);
    s().retractMessage(K, 'srv1');
    const msg = s().threads[K][0];
    expect(msg.retracted).toBe(true);
    expect(msg.text).toBe('');
  });

  it('pushMessage conserve l\'ancre de réponse (msgId cité)', () => {
    s().pushMessage(K, { kind: 'them', text: 'question', msgId: 'm1' } as never);
    s().pushMessage(K, { kind: 'me', text: 'réponse', msgId: 'm2', replyTo: 'm1' } as never);
    const [cite, reponse] = s().threads[K];
    expect(reponse.replyTo).toBe('m1');
    expect(cite.msgId).toBe('m1');
  });

  it('retractMessage sur une conversation inexistante est un no-op', () => {
    s().retractMessage('pm:inexistant', 'x');
    expect(s().threads['pm:inexistant']).toBeUndefined();
  });

  it('clearUnread supprime le compteur', () => {
    s().pushMessage(K, { kind: 'them', text: '1' } as never);
    s().clearUnread(K);
    expect(s().unread[K]).toBeUndefined();
  });
});

describe('mentions', () => {
  const K = 'room:r1';

  it('un message qui nous nomme lève le drapeau de la conversation', () => {
    s().pushMessage(K, { kind: 'them', text: '@moi tu viens ?', mentionsMe: true } as never);
    expect(s().mentioned[K]).toBe(true);
    expect(s().unread[K]).toBe(1);
  });

  it('aucun drapeau si la conversation est déjà ouverte', () => {
    s().setActive({ kind: 'room', id: 'r1' });
    s().pushMessage(K, { kind: 'them', text: '@moi', mentionsMe: true } as never);
    expect(s().mentioned[K]).toBeUndefined();
  });

  it('ouvrir la conversation éteint le drapeau', () => {
    s().pushMessage(K, { kind: 'them', text: '@moi', mentionsMe: true } as never);
    s().setActive({ kind: 'room', id: 'r1' });
    expect(s().mentioned[K]).toBeUndefined();
  });

  it('clearUnread éteint aussi le drapeau', () => {
    s().pushMessage(K, { kind: 'them', text: '@moi', mentionsMe: true } as never);
    s().clearUnread(K);
    expect(s().mentioned[K]).toBeUndefined();
  });

  it('un message ordinaire laisse le drapeau baissé', () => {
    s().pushMessage(K, { kind: 'them', text: 'bonjour' } as never);
    expect(s().mentioned[K]).toBeUndefined();
  });
});

describe('son des notifications', () => {
  const rang = () => vi.mocked(chime).mock.calls.map(([kind]) => kind);

  beforeEach(() => {
    vi.mocked(chime).mockClear();
    // L'environnement de test est `node` : pas de `document`. Le store s'en passe
    // (l'onglet est alors réputé visible) et chaque cas pose ce qu'il lui faut.
    Reflect.deleteProperty(globalThis, 'document');
  });

  /** Onglet en arrière-plan, le seul état que le store consulte. */
  const hideTab = () =>
    Object.defineProperty(globalThis, 'document', {
      value: { hidden: true },
      configurable: true,
      writable: true,
    });

  it('un salon qui passe sonne de sa voix', () => {
    s().pushMessage('room:r1', { kind: 'them', text: 'bonjour' } as never);
    expect(rang()).toEqual(['message']);
  });

  it('un message privé a la voix de ce qui s’adresse à nous', () => {
    s().pushMessage('pm:a', { kind: 'them', text: 'salut' } as never);
    expect(rang()).toEqual(['alert']);
  });

  it('une mention en salon prend elle aussi cette voix', () => {
    s().pushMessage('room:r1', { kind: 'them', text: '@moi ?', mentionsMe: true } as never);
    expect(rang()).toEqual(['alert']);
  });

  it('la conversation sous les yeux reste silencieuse', () => {
    s().setActive({ kind: 'room', id: 'r1' });
    s().pushMessage('room:r1', { kind: 'them', text: 'bonjour' } as never);
    expect(rang()).toEqual([]);
  });

  it('mais elle sonne si l’onglet est passé en arrière-plan', () => {
    // C'est le cas que la pastille de non-lus ne couvre pas : la conversation est
    // ouverte, donc rien n'est compté — et personne n'a les yeux dessus.
    s().setActive({ kind: 'room', id: 'r1' });
    hideTab();
    s().pushMessage('room:r1', { kind: 'them', text: 'bonjour' } as never);
    expect(rang()).toEqual(['message']);
  });

  it('ses propres messages et les messages système ne sonnent jamais', () => {
    hideTab();
    s().pushMessage('room:r1', { kind: 'me', text: 'moi' } as never);
    s().pushMessage('room:r1', { kind: 'system', text: 'Bob a rejoint le salon.' } as never);
    expect(rang()).toEqual([]);
  });
});

describe('indicateur de saisie', () => {
  const K = 'room:r1';

  it('markTyping puis clearTyping', () => {
    s().markTyping(K, 'u1', 'Alice');
    expect(s().typing[K].u1.pseudo).toBe('Alice');
    s().clearTyping(K, 'u1');
    expect(s().typing[K].u1).toBeUndefined();
  });

  it('markTyping fixe une échéance future (until)', () => {
    s().markTyping(K, 'u1', 'Alice');
    expect(s().typing[K].u1.until).toBeGreaterThan(Date.now());
  });

  it('clearTyping sur un utilisateur absent est un no-op', () => {
    s().clearTyping('room:vide', 'u9');
    expect(s().typing['room:vide']).toBeUndefined();
  });
});

describe('toast & navigateur de salons', () => {
  it('showToast/hideToast', () => {
    s().showToast('coucou', 'warn');
    expect(s().toast).toEqual({ text: 'coucou', tone: 'warn' });
    s().hideToast();
    expect(s().toast).toBe(null);
  });

  it('setRoomBrowser bascule la modale', () => {
    s().setRoomBrowser(true);
    expect(s().roomBrowser).toBe(true);
  });
});

describe('invitation à une conversation privée (design 2026-08-03)', () => {
  it('setInvite ouvre un rendez-vous, personne encore attendu', () => {
    s().setInvite({ token: 'jeton', guest: null });
    expect(s().invite).toEqual({ token: 'jeton', guest: null });
  });

  it('setInviteGuest annonce l’arrivant sans toucher au jeton', () => {
    s().setInvite({ token: 'jeton', guest: null });
    s().setInviteGuest(person('b', 'Bob'));
    expect(s().invite?.token).toBe('jeton');
    expect(s().invite?.guest?.pseudo).toBe('Bob');
  });

  it('setInviteGuest ne ressuscite pas une invitation retirée', () => {
    s().setInviteGuest(person('b', 'Bob'));
    expect(s().invite).toBe(null);
  });

  it('setAwaitingInvite porte le versant invité du rendez-vous', () => {
    s().setAwaitingInvite({ pseudo: 'Alice' });
    expect(s().awaitingInvite).toEqual({ pseudo: 'Alice' });
    s().setAwaitingInvite(null);
    expect(s().awaitingInvite).toBe(null);
  });

  it('reset efface le rendez-vous (RG-01/02 : rien ne survit à la session)', () => {
    s().setInvite({ token: 'jeton', guest: person('b') });
    s().setAwaitingInvite({ pseudo: 'Alice' });
    s().reset();
    expect(s().invite).toBe(null);
    expect(s().awaitingInvite).toBe(null);
  });
});

// ===========================================================================
// SERVICE ONION TOR (design 2026-07-29)
// ===========================================================================
describe('accès onion', () => {
  it('setMe range l\'accès onion transmis par le serveur', () => {
    s().setMe(person('a'), 75, true);
    expect(s().onion).toBe(true);
  });

  it('setMe sans le drapeau vaut clearnet (défaut sûr)', () => {
    s().setMe(person('a'), 75);
    expect(s().onion).toBe(false);
  });

  it('reset efface l\'accès onion (nouvelle session, nouvelle connexion)', () => {
    s().setMe(person('a'), 75, true);
    s().reset();
    expect(s().onion).toBe(false);
  });

  /**
   * `legal` porte la configuration de site (point de contact DSA, adresse onion),
   * pas de l'état de session : la remise à zéro ne doit pas la jeter, sinon
   * chaque fin de session rejouerait une requête `/api/legal`.
   */
  it('reset conserve la configuration publique', () => {
    s().setLegal({ contactEmail: 'x@y.z', lastUpdated: '2026-08-03', onionHost: 'exemple.onion' });
    s().reset();
    expect(s().legal?.onionHost).toBe('exemple.onion');
  });

  /**
   * LE garde-fou de l'arbitrage du 2026-08-03. L'accès onion est visible de SOI
   * SEUL : le diffuser ferait des rares visiteurs Tor d'un salon une classe
   * repérable. Ce test échoue si quelqu'un ajoute le champ à `Person` ou à
   * `RoomMember` — c'est-à-dire au moment précis où la décision serait défaite.
   */
  it('aucun accès onion ne transite par les profils publics', () => {
    s().setPeople([person('a'), person('b')]);
    for (const p of Object.values(s().people)) expect('onion' in p).toBe(false);

    s().rememberPmPeer(person('c'));
    for (const p of Object.values(s().pmPeers)) expect('onion' in p).toBe(false);
  });
});
