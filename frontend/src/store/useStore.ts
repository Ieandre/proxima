import { create } from 'zustand';
import { chime } from '../lib/sound';
import type { ActiveKey, JoinedRoom, Message, Person, RoomMember, RoomSummary } from '../lib/types';

let msgSeq = 0;
const mkMsg = (m: Omit<Message, 'localId'>): Message => ({ localId: `m${++msgSeq}`, ...m });

export const convKey = (k: NonNullable<ActiveKey>) => `${k.kind}:${k.id}`;

type State = {
  // Identité de session (volatile, en mémoire uniquement — RG-01/RG-02)
  me: Person | null;
  radiusKm: number;
  status: 'connecting' | 'onboarding' | 'live' | 'disconnected';

  /**
   * Cette connexion arrive-t-elle par le service onion Tor ?
   *
   * Renseigné par le SERVEUR, dans l'accusé d'`identify` — délibérément, et non
   * déduit de `location.hostname` : c'est ce qui en fait aussi le témoin que le
   * marquage Caddy fonctionne. Un badge présent sur le clearnet signifierait que
   * le marqueur est forgeable, donc que l'anti-spam est contournable.
   *
   * Visible de soi seul : il n'est JAMAIS diffusé aux autres présents, et
   * n'apparaît donc ni sur `Person` ni sur `RoomMember`. Publier qui est sur Tor
   * transformerait l'anonymat en signe distinctif — les rares visiteurs onion
   * d'un salon deviendraient une classe repérable.
   */
  onion: boolean;

  /**
   * Configuration publique servie par `/api/legal`, chargée UNE fois par `App.tsx`
   * et distribuée ici. Sans ça, la requête partirait trois fois : deux `SiteFooter`
   * (accueil + pages juridiques) et `About`. Survit à `reset()` — c'est de la
   * configuration de site, pas de l'état de session.
   */
  legal: { contactEmail: string; lastUpdated: string; onionHost: string } | null;

  // Présence de proximité
  people: Record<string, Person>;
  // Correspondants de MP (peut inclure une personne sortie du rayon entre-temps)
  pmPeers: Record<string, Person>;

  // Salons
  publicRooms: RoomSummary[];
  joinedRooms: Record<string, JoinedRoom>;
  // Salon de région rejoint automatiquement à l'arrivée — épinglé en
  // tête de liste. Conservé APRÈS une sortie : les salons de région sont hors annuaire
  // public (`rooms.listPublic` les écarte), donc l'oublier ferait disparaître la ligne
  // de l'écran et rendrait le retour impossible jusqu'au rechargement.
  homeRoom: { id: string; name: string } | null;
  // Salons chiffrés — clé secretbox + mot de passe en clair, RAM SEULE,
  // jamais persistés (RG-01/02), perdus au reload. Le mot de passe sert au « copier le mot de passe »
  // et n'existe donc qu'en régime mot de passe : un salon public n'en a aucun.
  roomKeys: Record<string, Uint8Array>;
  roomPasswords: Record<string, string>;
  // Génération de la clé détenue, par salon en régime de GROUPE. Elle voyage avec
  // chaque message envoyé : sans elle, un destinataire resté sur une génération
  // antérieure ne saurait pas qu'il lui manque une clé plutôt que de constater un
  // message corrompu. Vaut 0 en régime mot de passe (une clé dérivée n'a pas de génération).
  roomKeyEpochs: Record<string, number>;

  // Fils de discussion
  threads: Record<string, Message[]>; // clé = convKey
  unread: Record<string, number>;
  // Conversations où l'on a été interpellé par son pseudo depuis la dernière lecture.
  // Séparé du compteur : « on parle de vous » n'est pas la même information que
  // « il y a du nouveau », et la barre latérale les distingue.
  mentioned: Record<string, boolean>;
  // Indicateur « est en train d'écrire » : convKey -> { userId -> { pseudo, until } }
  typing: Record<string, Record<string, { pseudo: string; until: number }>>;
  active: ActiveKey;

  // Navigateur de salons (modal) — piloté globalement pour être ouvrable depuis l'accueil.
  roomBrowser: boolean;

  // Invitation à une conversation privée par lien : le lien
  // que J'AI ouvert, et qui n'existe que tant que cet onglet est là.
  // `guest` porte les deux états à lui seul — null tant que personne n'a ouvert le
  // lien, le profil de l'arrivant dès qu'il se présente. Deux drapeaux séparés
  // auraient pu diverger ; ici l'attente est littéralement l'absence d'invité.
  invite: { token: string; guest: Person | null } | null;
  // Le versant invité du même rendez-vous : on s'est présenté, on attend l'accord.
  // Sans cet état, l'invité restait sans aucun repère entre sa présentation et
  // l'ouverture du fil — le seul moment du parcours qu'il ne contrôle pas.
  awaitingInvite: { pseudo: string } | null;

  toast: { text: string; tone: 'info' | 'warn' } | null;

  // --- mutations ---
  setStatus: (s: State['status']) => void;
  setMe: (me: Person, radiusKm: number, onion?: boolean) => void;
  setLegal: (legal: State['legal']) => void;
  /** Met à jour son propre profil sans toucher au statut (renommage en cours de session). */
  updateMe: (me: Person) => void;
  reset: () => void;

  setPeople: (list: Person[]) => void;
  addPerson: (p: Person) => void;
  removePerson: (id: string) => void;
  rememberPmPeer: (p: Person) => void;

  setPublicRooms: (rooms: RoomSummary[]) => void;
  setHomeRoom: (room: { id: string; name: string } | null) => void;
  upsertJoinedRoom: (room: JoinedRoom) => void;
  setRoomKey: (roomId: string, key: Uint8Array, password: string) => void;
  setGroupKey: (roomId: string, key: Uint8Array, epoch: number) => void;
  setRoomMembers: (roomId: string, members: RoomMember[], owner: string) => void;
  removeJoinedRoom: (roomId: string) => void;

  pushMessage: (key: string, msg: Omit<Message, 'localId'>) => void;
  retractMessage: (key: string, msgId: string) => void;
  editMessage: (key: string, msgId: string, text: string, from?: string) => void;
  setActive: (active: ActiveKey) => void;
  clearUnread: (key: string) => void;
  markTyping: (key: string, userId: string, pseudo: string) => void;
  clearTyping: (key: string, userId: string) => void;

  setRoomBrowser: (open: boolean) => void;
  setInvite: (invite: State['invite']) => void;
  setInviteGuest: (guest: Person | null) => void;
  setAwaitingInvite: (awaiting: State['awaitingInvite']) => void;

  showToast: (text: string, tone?: 'info' | 'warn') => void;
  hideToast: () => void;
};

const initial = {
  me: null as Person | null,
  radiusKm: 75,
  status: 'connecting' as State['status'],
  onion: false,
  legal: null as State['legal'],
  people: {} as Record<string, Person>,
  pmPeers: {} as Record<string, Person>,
  publicRooms: [] as RoomSummary[],
  joinedRooms: {} as Record<string, JoinedRoom>,
  homeRoom: null as { id: string; name: string } | null,
  roomKeys: {} as Record<string, Uint8Array>,
  roomPasswords: {} as Record<string, string>,
  roomKeyEpochs: {} as Record<string, number>,
  threads: {} as Record<string, Message[]>,
  unread: {} as Record<string, number>,
  mentioned: {} as Record<string, boolean>,
  typing: {} as Record<string, Record<string, { pseudo: string; until: number }>>,
  active: null as ActiveKey,
  roomBrowser: false,
  invite: null as { token: string; guest: Person | null } | null,
  awaitingInvite: null as { pseudo: string } | null,
  toast: null as State['toast'],
};

export const useStore = create<State>((set, get) => ({
  ...initial,

  setStatus: (status) => set({ status }),
  setMe: (me, radiusKm, onion = false) => set({ me, radiusKm, onion, status: 'live' }),
  setLegal: (legal) => set({ legal }),
  updateMe: (me) => set({ me }),
  // `legal` échappe à la remise à zéro : c'est de la configuration de site, elle
  // ne dépend pas de la session et la recharger provoquerait une requête de plus.
  reset: () => set((s) => ({ ...initial, legal: s.legal, status: 'onboarding' })),

  setPeople: (list) => set({ people: Object.fromEntries(list.map((p) => [p.id, p])) }),
  addPerson: (p) => set((s) => ({ people: { ...s.people, [p.id]: p } })),
  removePerson: (id) =>
    set((s) => {
      const people = { ...s.people };
      delete people[id];
      return { people };
    }),
  rememberPmPeer: (p) => set((s) => ({ pmPeers: { ...s.pmPeers, [p.id]: p } })),

  setPublicRooms: (publicRooms) => set({ publicRooms }),
  setHomeRoom: (homeRoom) => set({ homeRoom }),
  upsertJoinedRoom: (room) => set((s) => ({ joinedRooms: { ...s.joinedRooms, [room.id]: room } })),
  setRoomKey: (roomId, key, password) =>
    set((s) => ({
      roomKeys: { ...s.roomKeys, [roomId]: key },
      roomPasswords: { ...s.roomPasswords, [roomId]: password },
    })),
  /**
   * Clé d'un salon PUBLIC. Aucun mot de passe à retenir — il n'y en a pas — mais une
   * génération, que l'on n'écrase JAMAIS par une plus ancienne : les remises arrivent
   * de plusieurs membres sollicités en parallèle, et une réponse tardive portant la
   * génération d'avant remettrait le salon dans le noir.
   */
  setGroupKey: (roomId, key, epoch) =>
    set((s) => {
      // Une clé DÉJÀ en place ne se remplace que par une génération STRICTEMENT plus
      // récente. Une remise à époque égale (ou antérieure) est soit la réponse tardive
      // d'un autre porteur — la même clé, sans intérêt —, soit la tentative d'un membre
      // d'imposer SA clé pour détourner le fil d'un participant : on l'écarte dans les
      // deux cas. La toute première clé (aucune encore en RAM) est en revanche acceptée.
      if (s.roomKeys[roomId] && epoch <= (s.roomKeyEpochs[roomId] || 0)) return {};
      return {
        roomKeys: { ...s.roomKeys, [roomId]: key },
        roomKeyEpochs: { ...s.roomKeyEpochs, [roomId]: epoch },
      };
    }),
  setRoomMembers: (roomId, members, owner) =>
    set((s) => {
      const r = s.joinedRooms[roomId];
      if (!r) return {};
      return { joinedRooms: { ...s.joinedRooms, [roomId]: { ...r, members, owner } } };
    }),
  removeJoinedRoom: (roomId) =>
    set((s) => {
      const joinedRooms = { ...s.joinedRooms };
      delete joinedRooms[roomId];
      // Purge de la clé et du mot de passe en RAM (RG-01/02).
      const roomKeys = { ...s.roomKeys };
      const roomPasswords = { ...s.roomPasswords };
      const roomKeyEpochs = { ...s.roomKeyEpochs };
      delete roomKeys[roomId];
      delete roomPasswords[roomId];
      delete roomKeyEpochs[roomId];
      const active = s.active && s.active.kind === 'room' && s.active.id === roomId ? null : s.active;
      // `homeRoom` n'est PAS effacé : sorti de son salon de région, on doit encore le
      // voir dans la liste (en gris) pour pouvoir y revenir.
      return { joinedRooms, roomKeys, roomPasswords, roomKeyEpochs, active };
    }),

  pushMessage: (key, msg) => {
    const active = get().active;
    const isActive = !!active && convKey(active) === key;

    set((s) => {
      const thread = s.threads[key] ? [...s.threads[key], mkMsg(msg)] : [mkMsg(msg)];
      // Les messages système (arrivée/départ, renommage…) ne sont pas « à lire » :
      // les comptabiliser ferait gonfler la pastille sans contenu réel derrière.
      const counts = !isActive && msg.kind !== 'me' && msg.kind !== 'system';
      const unread = counts ? { ...s.unread, [key]: (s.unread[key] || 0) + 1 } : s.unread;
      // Une mention dans la conversation qu'on a sous les yeux n'a rien à signaler.
      const mentioned = counts && msg.mentionsMe ? { ...s.mentioned, [key]: true } : s.mentioned;
      return { threads: { ...s.threads, [key]: thread }, unread, mentioned };
    });

    // Le son suit une règle plus large que la pastille, et hors du `set` — sonner
    // est un effet, pas un calcul d'état. Une conversation ouverte dans un onglet
    // passé en arrière-plan ne compte aucun non-lu ; c'est pourtant exactement là
    // qu'un signal sonore sert, puisque rien n'est sous les yeux. Ce qui s'adresse
    // à nous (MP, mention) a sa propre voix : « on vous parle » n'est pas la même
    // information que « un salon vit ».
    if (msg.kind !== 'them') return;
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (isActive && !hidden) return;
    chime(msg.mentionsMe || key.startsWith('pm:') ? 'alert' : 'message');
  },

  retractMessage: (key, msgId) =>
    set((s) => {
      const thread = s.threads[key];
      if (!thread) return {};
      const next = thread.map((m) =>
        m.msgId === msgId ? { ...m, retracted: true, text: '', media: undefined } : m,
      );
      return { threads: { ...s.threads, [key]: next } };
    }),

  /**
   * Remplace le texte d'un message déjà affiché.
   *
   * C'est ICI que se vérifie l'autorisation, et nulle part ailleurs : le serveur
   * ne conserve aucun message, il n'a donc pas les moyens de savoir qui a écrit
   * celui que l'on prétend modifier. Le fil, lui, est là. `from` est l'auteur
   * revendiqué, tel que le serveur l'atteste depuis la connexion de l'émetteur —
   * une modification qui ne correspond pas à l'auteur du message visé est
   * ignorée. Absent, c'est l'écho de sa propre modification : seule une bulle à
   * soi peut alors être touchée.
   *
   * Deux refus de plus, qui sont des règles et pas des détails : un message
   * RETIRÉ par la modération ne se réécrit pas (sinon éditer défait le retrait),
   * et une pièce jointe n'a pas de texte à remplacer.
   *
   * `mentionsMe` n'est pas recalculé : une modification ne doit pas pouvoir faire
   * sonner quelqu'un après coup, ni le faire sonner à répétition. Le pseudo
   * ajouté sera bien mis en évidence dans la bulle — la reconnaissance des
   * mentions se fait à l'affichage, contre les présents — mais sans alerte.
   */
  editMessage: (key, msgId, text, from) =>
    set((s) => {
      const thread = s.threads[key];
      if (!thread || !msgId) return {};
      let touched = false;
      const next = thread.map((m) => {
        if (m.msgId !== msgId || m.retracted || m.media) return m;
        if (from ? m.fromId !== from : m.kind !== 'me') return m;
        touched = true;
        return { ...m, text, edited: true };
      });
      return touched ? { threads: { ...s.threads, [key]: next } } : {};
    }),

  setActive: (active) =>
    set((s) => {
      if (!active) return { active };
      const key = convKey(active);
      const unread = { ...s.unread };
      const mentioned = { ...s.mentioned };
      delete unread[key];
      delete mentioned[key];
      return { active, unread, mentioned };
    }),

  clearUnread: (key) =>
    set((s) => {
      const unread = { ...s.unread };
      const mentioned = { ...s.mentioned };
      delete unread[key];
      delete mentioned[key];
      return { unread, mentioned };
    }),

  markTyping: (key, userId, pseudo) =>
    set((s) => ({
      typing: {
        ...s.typing,
        [key]: { ...(s.typing[key] || {}), [userId]: { pseudo, until: Date.now() + 4500 } },
      },
    })),

  clearTyping: (key, userId) =>
    set((s) => {
      const cur = s.typing[key];
      if (!cur || !cur[userId]) return {};
      const next = { ...cur };
      delete next[userId];
      return { typing: { ...s.typing, [key]: next } };
    }),

  setRoomBrowser: (roomBrowser) => set({ roomBrowser }),

  setInvite: (invite) => set({ invite }),
  // Ne ressuscite pas une invitation retirée entre-temps : sans lien ouvert, il
  // n'y a personne à annoncer.
  setInviteGuest: (guest) => set((s) => (s.invite ? { invite: { ...s.invite, guest } } : {})),
  setAwaitingInvite: (awaitingInvite) => set({ awaitingInvite }),

  showToast: (text, tone = 'info') => {
    set({ toast: { text, tone } });
    setTimeout(() => {
      if (get().toast?.text === text) set({ toast: null });
    }, 4000);
  },
  hideToast: () => set({ toast: null }),
}));
