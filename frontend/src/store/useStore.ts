import { createPinia, defineStore } from 'pinia';
import { chime } from '../lib/sound';
import type { ActiveKey, JoinedRoom, Message, Person, RoomMember, RoomSummary } from '../lib/types';

/**
 * Instance Pinia unique de l'application, créée ici et non dans `main.ts` :
 * `lib/socket.ts` et les tests accèdent au store HORS de tout composant, avant
 * même que l'application Vue ne soit montée. `main.ts` installe cette même
 * instance via `app.use(pinia)` — composants et couche socket voient donc
 * exactement le même état.
 */
export const pinia = createPinia();

/** Accès au store hors composant (couche socket, tests). */
export const store = () => useStore(pinia);

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
   * Configuration publique servie par `/api/legal`, chargée UNE fois par `App.vue`
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
  // (Les `Uint8Array` ne sont pas convertis par la réactivité de Vue : les clés
  // restent des tableaux d'octets bruts, tels que libsodium les attend.)
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
};

// Fabrique et non objet partagé : chaque `reset()` doit repartir de records
// NEUFS — les actions mutent l'état en place (réactivité Vue), un état initial
// partagé serait corrompu par la première session venue.
const initial = (): State => ({
  me: null,
  radiusKm: 75,
  status: 'connecting',
  onion: false,
  legal: null,
  people: {},
  pmPeers: {},
  publicRooms: [],
  joinedRooms: {},
  homeRoom: null,
  roomKeys: {},
  roomPasswords: {},
  roomKeyEpochs: {},
  threads: {},
  unread: {},
  mentioned: {},
  typing: {},
  active: null,
  roomBrowser: false,
  invite: null,
  awaitingInvite: null,
  toast: null,
});

export const useStore = defineStore('proxima', {
  state: initial,

  actions: {
    setStatus(status: State['status']) {
      this.status = status;
    },
    setMe(me: Person, radiusKm: number, onion = false) {
      this.me = me;
      this.radiusKm = radiusKm;
      this.onion = onion;
      this.status = 'live';
    },
    setLegal(legal: State['legal']) {
      this.legal = legal;
    },
    /** Met à jour son propre profil sans toucher au statut (renommage en cours de session). */
    updateMe(me: Person) {
      this.me = me;
    },
    // `legal` échappe à la remise à zéro : c'est de la configuration de site, elle
    // ne dépend pas de la session et la recharger provoquerait une requête de plus.
    reset() {
      Object.assign(this, { ...initial(), legal: this.legal, status: 'onboarding' as const });
    },

    setPeople(list: Person[]) {
      this.people = Object.fromEntries(list.map((p) => [p.id, p]));
    },
    addPerson(p: Person) {
      this.people[p.id] = p;
    },
    removePerson(id: string) {
      delete this.people[id];
    },
    rememberPmPeer(p: Person) {
      this.pmPeers[p.id] = p;
    },

    setPublicRooms(publicRooms: RoomSummary[]) {
      this.publicRooms = publicRooms;
    },
    setHomeRoom(homeRoom: { id: string; name: string } | null) {
      this.homeRoom = homeRoom;
    },
    upsertJoinedRoom(room: JoinedRoom) {
      this.joinedRooms[room.id] = room;
    },
    setRoomKey(roomId: string, key: Uint8Array, password: string) {
      this.roomKeys[roomId] = key;
      this.roomPasswords[roomId] = password;
    },
    /**
     * Clé d'un salon PUBLIC. Aucun mot de passe à retenir — il n'y en a pas — mais une
     * génération, que l'on n'écrase JAMAIS par une plus ancienne : les remises arrivent
     * de plusieurs membres sollicités en parallèle, et une réponse tardive portant la
     * génération d'avant remettrait le salon dans le noir.
     */
    setGroupKey(roomId: string, key: Uint8Array, epoch: number) {
      // Une clé DÉJÀ en place ne se remplace que par une génération STRICTEMENT plus
      // récente. Une remise à époque égale (ou antérieure) est soit la réponse tardive
      // d'un autre porteur — la même clé, sans intérêt —, soit la tentative d'un membre
      // d'imposer SA clé pour détourner le fil d'un participant : on l'écarte dans les
      // deux cas. La toute première clé (aucune encore en RAM) est en revanche acceptée.
      if (this.roomKeys[roomId] && epoch <= (this.roomKeyEpochs[roomId] || 0)) return;
      this.roomKeys[roomId] = key;
      this.roomKeyEpochs[roomId] = epoch;
    },
    setRoomMembers(roomId: string, members: RoomMember[], owner: string) {
      const r = this.joinedRooms[roomId];
      if (!r) return;
      r.members = members;
      r.owner = owner;
    },
    removeJoinedRoom(roomId: string) {
      delete this.joinedRooms[roomId];
      // Purge de la clé et du mot de passe en RAM (RG-01/02).
      delete this.roomKeys[roomId];
      delete this.roomPasswords[roomId];
      delete this.roomKeyEpochs[roomId];
      if (this.active && this.active.kind === 'room' && this.active.id === roomId) this.active = null;
      // `homeRoom` n'est PAS effacé : sorti de son salon de région, on doit encore le
      // voir dans la liste (en gris) pour pouvoir y revenir.
    },

    pushMessage(key: string, msg: Omit<Message, 'localId'>) {
      const active = this.active;
      const isActive = !!active && convKey(active) === key;

      // Relire `this.threads[key]` APRÈS l'avoir créé : c'est la relecture qui rend
      // le tableau réactif — pousser dans la valeur brute échapperait au suivi de Vue.
      if (!this.threads[key]) this.threads[key] = [];
      this.threads[key].push(mkMsg(msg));
      // Les messages système (arrivée/départ, renommage…) ne sont pas « à lire » :
      // les comptabiliser ferait gonfler la pastille sans contenu réel derrière.
      const counts = !isActive && msg.kind !== 'me' && msg.kind !== 'system';
      if (counts) this.unread[key] = (this.unread[key] || 0) + 1;
      // Une mention dans la conversation qu'on a sous les yeux n'a rien à signaler.
      if (counts && msg.mentionsMe) this.mentioned[key] = true;

      // Le son suit une règle plus large que la pastille, et hors mutation d'état —
      // sonner est un effet, pas un calcul d'état. Une conversation ouverte dans un
      // onglet passé en arrière-plan ne compte aucun non-lu ; c'est pourtant exactement
      // là qu'un signal sonore sert, puisque rien n'est sous les yeux. Ce qui s'adresse
      // à nous (MP, mention) a sa propre voix : « on vous parle » n'est pas la même
      // information que « un salon vit ».
      if (msg.kind !== 'them') return;
      const hidden = typeof document !== 'undefined' && document.hidden;
      if (isActive && !hidden) return;
      chime(msg.mentionsMe || key.startsWith('pm:') ? 'alert' : 'message');
    },

    retractMessage(key: string, msgId: string) {
      const thread = this.threads[key];
      if (!thread) return;
      for (const m of thread) {
        if (m.msgId !== msgId) continue;
        m.retracted = true;
        m.text = '';
        m.media = undefined;
      }
    },

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
    editMessage(key: string, msgId: string, text: string, from?: string) {
      const thread = this.threads[key];
      if (!thread || !msgId) return;
      for (const m of thread) {
        if (m.msgId !== msgId || m.retracted || m.media) continue;
        if (from ? m.fromId !== from : m.kind !== 'me') continue;
        m.text = text;
        m.edited = true;
      }
    },

    setActive(active: ActiveKey) {
      this.active = active;
      if (!active) return;
      const key = convKey(active);
      delete this.unread[key];
      delete this.mentioned[key];
    },

    clearUnread(key: string) {
      delete this.unread[key];
      delete this.mentioned[key];
    },

    markTyping(key: string, userId: string, pseudo: string) {
      // Même relecture volontaire que `pushMessage` : écrire dans l'objet brut
      // fraîchement créé passerait sous le radar de la réactivité.
      if (!this.typing[key]) this.typing[key] = {};
      this.typing[key][userId] = { pseudo, until: Date.now() + 4500 };
    },

    clearTyping(key: string, userId: string) {
      const cur = this.typing[key];
      if (!cur || !cur[userId]) return;
      delete cur[userId];
    },

    setRoomBrowser(open: boolean) {
      this.roomBrowser = open;
    },

    setInvite(invite: State['invite']) {
      this.invite = invite;
    },
    // Ne ressuscite pas une invitation retirée entre-temps : sans lien ouvert, il
    // n'y a personne à annoncer.
    setInviteGuest(guest: Person | null) {
      if (this.invite) this.invite.guest = guest;
    },
    setAwaitingInvite(awaitingInvite: State['awaitingInvite']) {
      this.awaitingInvite = awaitingInvite;
    },

    showToast(text: string, tone: 'info' | 'warn' = 'info') {
      this.toast = { text, tone };
      setTimeout(() => {
        if (this.toast?.text === text) this.toast = null;
      }, 4000);
    },
    hideToast() {
      this.toast = null;
    },
  },
});
