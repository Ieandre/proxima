import { io, type Socket } from 'socket.io-client';
import { convKey, useStore } from '../store/useStore';
import type { JoinedRoom, Person, RoomMember, RoomSummary } from './types';
import {
  decryptBytes,
  decryptFrom,
  decryptRoom,
  decryptRoomBytes,
  deriveRoomMaterial,
  encryptBytesFor,
  encryptFor,
  encryptRoom,
  encryptRoomBytes,
  exportPublicKey,
  genRoomSalt,
  initCrypto,
  type Envelope,
  type RoomEnvelope,
} from './crypto';
import { decodeBody, encodeBody, newMessageId } from './body';
import { forgetIdentity, recallIdentity, rememberIdentity, type DeclaredIdentity } from './identity';
import { mentionsPseudo } from './mentions';
import { blobUrl, prepareMedia } from './media';
import { peerFromMember } from './people';
import { chime } from './sound';

let socket: Socket | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;

const s = () => useStore.getState();
const now = () => Date.now();

/**
 * Enveloppe d'un MP. Pour un média, `c` reste vide (les octets voyagent dans `data`)
 * et le corps scellé — identifiant du message, réponse citée — occupe `body`, sa
 * propre enveloppe : deux clairs ne peuvent pas partager le nonce `n`.
 */
type PmEnvelope = Envelope & { mime?: string; media?: string; body?: Envelope };

/**
 * Une mention ne vit que dans le texte du message : on la reconnaît ici, à la
 * réception, contre son propre pseudo. Rien n'a donc été transmis pour la
 * signaler — sur un salon chiffré, le serveur ignore jusqu'à son existence.
 * Prévient au passage si l'on n'a pas le salon sous les yeux.
 */
function flagMention(roomId: string, text: string, fromPseudo: string, mine: boolean): boolean {
  const me = s().me;
  if (mine || !me || !text || !mentionsPseudo(text, me.pseudo)) return false;
  const key = `room:${roomId}`;
  const active = s().active;
  if (!active || convKey(active) !== key) {
    const room = s().joinedRooms[roomId];
    s().showToast(`${fromPseudo} vous a mentionné·e dans ${room ? room.name : 'un salon'}.`);
  }
  return true;
}

/**
 * Ouvre le fil des deux côtés une fois l'invitation acceptée.
 *
 * Le message système n'est pas décoratif : la barre latérale ne liste une
 * conversation privée hors rayon que si son fil contient au moins un message
 * (`offRadar`, Sidebar.tsx). Or l'invité et l'auteur se connaissent d'ailleurs et
 * ne sont presque jamais dans le même rayon. Sans cette première ligne, la
 * conversation n'aurait aucune ligne dans la liste tant que personne n'a parlé :
 * un clic ailleurs et elle devenait introuvable. Elle ne compte pas comme non-lue
 * — `pushMessage` écarte `kind === 'system'` du compteur.
 */
function openInvitedThread(peer: Person): void {
  s().rememberPmPeer(peer);
  s().pushMessage(`pm:${peer.id}`, {
    kind: 'system',
    text: 'Conversation ouverte par lien. Personne d’autre ne peut la rejoindre.',
    ts: now(),
  });
  s().setActive({ kind: 'pm', id: peer.id });
}

/* Titre d'origine, le temps d'une alerte d'onglet (cf. `notifyGuestArrival`). */
let titleBeforeAlert: string | null = null;

/**
 * Prévient HORS de l'écran quand quelqu'un ouvre notre lien.
 *
 * Ce n'est pas un raffinement : on vient de coller le lien dans une autre
 * application et on y est retourné. Si l'arrivée ne se découvrait qu'en revenant
 * de soi-même sur l'onglet, le rendez-vous échouerait par simple inattention — et
 * l'invitation meurt avec la session. Le titre suffit dans la plupart des cas ; la
 * notification système n'est utilisée que si elle a déjà été accordée.
 */
function notifyGuestArrival(pseudo: string): void {
  if (typeof document === 'undefined' || !document.hidden) return;

  // L'onglet est caché : le titre ne prévient que si l'on y revient les yeux
  // dessus. C'est le cas où le son porte réellement l'information.
  chime('alert');

  if (titleBeforeAlert === null) titleBeforeAlert = document.title;
  document.title = `${pseudo} vous attend — Proxima`;
  const restore = () => {
    if (document.hidden) return;
    if (titleBeforeAlert !== null) document.title = titleBeforeAlert;
    titleBeforeAlert = null;
    document.removeEventListener('visibilitychange', restore);
  };
  document.addEventListener('visibilitychange', restore);

  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Quelqu’un a ouvert votre lien', {
        body: `${pseudo} attend votre confirmation.`,
      });
    }
  } catch {
    /* Notifications indisponibles (contexte non sécurisé, navigateur) — le titre a prévenu. */
  }
}

/** Établit la connexion et câble tous les écouteurs temps réel. */
export async function connect(): Promise<void> {
  await initCrypto();
  socket = io({ autoConnect: true, transports: ['websocket', 'polling'] });

  socket.on('connect', async () => {
    if (s().status === 'live') return; // déjà identifié sur cette connexion

    // Reprise automatique après un rechargement de page ou une coupure réseau :
    // l'identité déclarée a été mémorisée pour la durée de l'onglet, on refait
    // l'`identify` sans repasser par le formulaire. La session serveur, elle, est
    // bien neuve : messages et salons rejoints ne reviennent pas (RG-01/RG-02),
    // d'où la remise à zéro de l'état résiduel avant de redemander une identité.
    const saved = recallIdentity();
    if (saved) {
      if (s().me) s().reset();
      s().setStatus('connecting');
      // Un accusé de réception qui n'arrive jamais (lien coupé entre l'envoi et la
      // réponse) laisserait l'écran de reprise tourner indéfiniment : on borne
      // l'attente et l'on rend la main au formulaire.
      const res = await Promise.race([
        identify(saved),
        new Promise<{ ok: boolean; error?: string }>((r) => setTimeout(() => r({ ok: false }), 8000)),
      ]);
      if (res.ok) return;
      // Refus explicite (ville retirée de la base, valeur hors bornes…) : la mémoire
      // est périmée, on l'efface. Silence, en revanche, ne prouve rien — on la garde,
      // la prochaine connexion réessaiera.
      if (res.error) forgetIdentity();
    }

    if (!s().me) s().setStatus('onboarding');
  });

  socket.on('disconnect', () => {
    // L'état du service est affiché en permanence dans la barre supérieure : il doit
    // donc refléter la réalité même avant identification, sans quoi la pastille reste
    // verte alors que le service est injoignable et que le formulaire va échouer.
    // L'alerte, elle, ne concerne que les sessions déjà en cours.
    s().setStatus('disconnected');
    if (s().me) s().showToast('Connexion perdue. Session terminée.', 'warn');
  });

  // --- Présence de proximité -------------------------------------------
  socket.on('presence:list', (list: Person[]) => s().setPeople(list));
  socket.on('presence:add', (p: Person) => {
    s().addPerson(p);
    s().showToast(`${p.pseudo} est apparu·e à proximité.`);
  });
  socket.on('presence:remove', ({ id }: { id: string }) => s().removePerson(id));
  // Renommage d'un voisin : `addPerson` remplace la fiche en place. Événement à part
  // de `presence:add`, dont l'annonce « est apparu·e à proximité » serait fausse ici.
  socket.on('presence:update', (p: Person) => s().addPerson(p));

  // --- Salons -----------------------------------------------------------
  socket.on('rooms:list', (rooms: RoomSummary[]) => s().setPublicRooms(rooms));
  socket.on('room:members', ({ roomId, members, owner }: { roomId: string; members: RoomMember[]; owner: string }) => {
    s().setRoomMembers(roomId, members, owner);
  });
  socket.on('room:system', ({ roomId, text }: { roomId: string; text: string }) => {
    s().pushMessage(`room:${roomId}`, { kind: 'system', text, ts: now() });
  });
  socket.on(
    'room:message',
    (m: {
      id?: string;
      roomId: string;
      fromId: string;
      fromPseudo: string;
      kind?: string;
      text?: string;
      mime?: string;
      media?: string;
      data?: ArrayBuffer;
      enc?: string;
      env?: RoomEnvelope & { body?: RoomEnvelope };
      replyTo?: string;
    }) => {
      const me = s().me;
      const base = {
        msgId: m.id,
        kind: (me && m.fromId === me.id ? 'me' : 'them') as 'me' | 'them',
        fromId: m.fromId,
        fromPseudo: m.fromPseudo,
        ts: now(),
      };
      // Salon chiffré E2E : déchiffrement local avec la clé en RAM. Échec ou clé absente
      // (reload) -> bulle « illisible » PAR MESSAGE, sans casser le fil (modèle pm:recv).
      if (m.enc) {
        const key = s().roomKeys[m.roomId];
        if (m.kind === 'media' && m.data) {
          try {
            if (!key || !m.env) throw new Error('clé absente');
            const bytes = decryptRoomBytes(key, m.env.n, new Uint8Array(m.data));
            const url = blobUrl(bytes, m.mime || '');
            // La référence de réponse d'un média voyage dans un corps scellé à part
            // (le nonce de `env` sert déjà aux octets du média — jamais réutilisé).
            const body = m.env.body ? decodeBody(decryptRoom(key, m.env.body)) : null;
            s().pushMessage(`room:${m.roomId}`, {
              ...base,
              encrypted: true,
              text: '',
              media: { url, mime: m.mime || '', kind: m.media === 'video' ? 'video' : 'image' },
              replyTo: body?.replyTo,
            });
          } catch {
            s().pushMessage(`room:${m.roomId}`, { ...base, encrypted: true, text: '⚠︎ média illisible' });
          }
        } else {
          let text: string;
          let replyTo: string | undefined;
          try {
            if (!key || !m.env) throw new Error('clé absente');
            const body = decodeBody(decryptRoom(key, m.env));
            text = body.text;
            replyTo = body.replyTo;
          } catch {
            text = key ? '⚠︎ message illisible (déchiffrement impossible)' : '⚠︎ message illisible (clé perdue, ressaisissez le mot de passe)';
          }
          s().pushMessage(`room:${m.roomId}`, {
            ...base,
            encrypted: true,
            text,
            replyTo,
            mentionsMe: flagMention(m.roomId, text, m.fromPseudo, base.kind === 'me'),
          });
        }
        s().clearTyping(`room:${m.roomId}`, m.fromId);
        return;
      }
      if (m.kind === 'media' && m.data) {
        const url = blobUrl(new Uint8Array(m.data), m.mime || '');
        s().pushMessage(`room:${m.roomId}`, {
          ...base,
          text: '',
          media: { url, mime: m.mime || '', kind: m.media === 'video' ? 'video' : 'image' },
          replyTo: m.replyTo,
        });
      } else {
        const text = m.text || '';
        s().pushMessage(`room:${m.roomId}`, {
          ...base,
          text,
          replyTo: m.replyTo,
          mentionsMe: flagMention(m.roomId, text, m.fromPseudo, base.kind === 'me'),
        });
      }
      s().clearTyping(`room:${m.roomId}`, m.fromId);
    },
  );
  // Retrait ciblé d'un message par la modération (best-effort chez les clients connectés).
  socket.on('room:retract', ({ roomId, messageId }: { roomId: string; messageId: string }) => {
    s().retractMessage(`room:${roomId}`, messageId);
  });
  // Notification au propriétaire d'un salon : un message de SON salon a été signalé (1ère ligne, RG-06).
  socket.on('room:report:owner', () => {
    s().showToast('Un message de votre salon a été signalé. Vous pouvez exclure l’auteur ou fermer le salon.', 'warn');
  });

  socket.on('room:closed', ({ roomId }: { roomId: string }) => {
    const r = s().joinedRooms[roomId];
    s().removeJoinedRoom(roomId);
    s().showToast(`Le salon ${r ? '« ' + r.name + ' »' : ''} a été fermé.`, 'warn');
  });
  socket.on('room:kicked', ({ roomId }: { roomId: string }) => {
    const r = s().joinedRooms[roomId];
    s().removeJoinedRoom(roomId);
    s().showToast(`Vous avez été exclu·e du salon ${r ? '« ' + r.name + ' »' : ''}.`, 'warn');
  });

  // --- Messages privés chiffrés ----------------------------------------
  socket.on(
    'pm:recv',
    async (m: { fromId: string; fromPseudo: string; kind?: string; env: PmEnvelope; data?: ArrayBuffer }) => {
      // Mémorise le pair (clé publique incluse dans l'enveloppe) pour pouvoir répondre.
      if (!s().people[m.fromId] && !s().pmPeers[m.fromId]) {
        s().rememberPmPeer({
          id: m.fromId,
          pseudo: m.fromPseudo,
          pub: m.env.pub,
          age: 0,
          gender: 'A',
          city: '',
          region: '',
          country: '',
          countryLabel: '',
        });
      }
      const base = { kind: 'them' as const, fromId: m.fromId, fromPseudo: m.fromPseudo, ts: now(), encrypted: true };
      if (m.kind === 'media' && m.data) {
        try {
          const bytes = decryptBytes(m.env.n, m.env.pub, new Uint8Array(m.data));
          const url = blobUrl(bytes, m.env.mime || '');
          // Identifiant et réponse d'un média : corps scellé à part, le nonce de `env`
          // servant déjà aux octets du média (jamais réutilisé pour deux clairs).
          const body = m.env.body ? decodeBody(decryptFrom(m.env.body)) : null;
          s().pushMessage(`pm:${m.fromId}`, {
            ...base,
            msgId: body?.id,
            text: '',
            media: { url, mime: m.env.mime || '', kind: m.env.media === 'video' ? 'video' : 'image' },
            replyTo: body?.replyTo,
          });
        } catch {
          s().pushMessage(`pm:${m.fromId}`, { ...base, text: '⚠︎ média illisible' });
        }
      } else {
        let text: string;
        let msgId: string | undefined;
        let replyTo: string | undefined;
        try {
          const body = decodeBody(await decryptFrom(m.env));
          text = body.text;
          msgId = body.id;
          replyTo = body.replyTo;
        } catch {
          text = '⚠︎ message illisible (déchiffrement impossible)';
        }
        s().pushMessage(`pm:${m.fromId}`, { ...base, msgId, text, replyTo });
      }
      s().clearTyping(`pm:${m.fromId}`, m.fromId);
    },
  );

  socket.on('pm:undeliverable', ({ toId }: { toId: string }) => {
    const peer = s().people[toId] || s().pmPeers[toId];
    s().showToast(`${peer ? peer.pseudo : 'Le destinataire'} n'est plus connecté·e.`, 'warn');
  });

  // --- Invitation à une conversation privée par lien ---
  socket.on('pm:invite:pending', ({ guest }: { token: string; guest: Person }) => {
    s().setInviteGuest(guest);
    notifyGuestArrival(guest.pseudo);
  });
  // Reçu par l'invité : l'auteur a confirmé, chacun a désormais la clé publique
  // de l'autre et le fil peut s'ouvrir.
  socket.on('pm:invite:accepted', ({ peer }: { peer: Person }) => {
    s().setAwaitingInvite(null);
    openInvitedThread(peer);
  });
  socket.on('pm:invite:declined', () => {
    s().setAwaitingInvite(null);
    s().showToast("Votre correspondant·e n'a pas confirmé l'ouverture.", 'warn');
  });

  socket.on('error:rate', () => s().showToast('Trop de messages. Patientez un instant.', 'warn'));

  // --- Indicateur « est en train d'écrire » ----------------------------
  socket.on('typing', (m: { scope: 'pm' | 'room'; fromId: string; fromPseudo: string; roomId?: string }) => {
    if (!m) return;
    if (m.scope === 'pm') s().markTyping(`pm:${m.fromId}`, m.fromId, m.fromPseudo);
    else if (m.scope === 'room' && m.roomId) s().markTyping(`room:${m.roomId}`, m.fromId, m.fromPseudo);
  });
}

// ===========================================================================
// Actions
// ===========================================================================

type IdentifyForm = DeclaredIdentity;

export async function identify(form: IdentifyForm): Promise<{ ok: boolean; error?: string }> {
  if (!socket) return { ok: false, error: 'Pas de connexion.' };
  const pub = await exportPublicKey();
  return new Promise((resolve) => {
    socket!.emit(
      'identify',
      { ...form, pub },
      (res: {
        ok?: boolean;
        error?: string;
        me?: Person;
        radiusKm?: number;
        homeRoom?: { room: JoinedRoom; owner: string; members: RoomMember[] } | null;
        // Connexion arrivée par le service onion. État de la
        // CONNEXION, pas de l'identité : il ne figure donc pas dans `me`, et n'est
        // jamais diffusé aux autres présents.
        onion?: boolean;
      }) => {
        if (res?.ok && res.me) {
          s().setMe(res.me, res.radiusKm || 75, !!res.onion);
          // Mémorisé pour la durée de l'onglet, afin de reprendre tout seul après un
          // rechargement. On garde la version que le serveur a acceptée (ville
          // canonique, pseudo rogné) : une reprise ne peut donc pas échouer sur une
          // valeur que l'on aurait nous-mêmes normalisée autrement.
          // `cityId` vient du formulaire et non de la réponse : le profil public
          // n'a pas à porter l'identifiant de commune, le serveur nous a déjà
          // confirmé le nom canonique qui va avec.
          rememberIdentity({
            pseudo: res.me.pseudo,
            age: res.me.age,
            gender: res.me.gender,
            city: res.me.city,
            ...(form.cityId ? { cityId: form.cityId } : {}),
          });
          startHeartbeat();
          // Salon de région : rejoint automatiquement, épinglé et affiché d'emblée.
          if (res.homeRoom?.room) {
            const hr = res.homeRoom;
            s().upsertJoinedRoom({ ...hr.room, owner: hr.owner, members: hr.members || [] });
            s().setHomeRoom({ id: hr.room.id, name: hr.room.name });
            s().setActive({ kind: 'room', id: hr.room.id });
          }
          resolve({ ok: true });
        } else {
          resolve({ ok: false, error: res?.error || 'Échec.' });
        }
      },
    );
  });
}

/**
 * Change son pseudo en cours de session. Le serveur l'annonce dans les salons
 * rejoints — c'est voulu, et c'est ce qui empêche de changer de nom au milieu
 * d'une conversation sans que personne ne le voie. Le salon de région fait
 * exception : on ne l'a pas choisi, il est muet sur tout (entrées, sorties, ici).
 *
 * Les messages déjà envoyés gardent le pseudo d'alors : ils ont été diffusés avec,
 * et le serveur ne réécrit rien.
 */
export async function renamePseudo(pseudo: string): Promise<{ ok: boolean; error?: string }> {
  if (!socket) return { ok: false, error: 'Pas de connexion.' };
  return new Promise((resolve) => {
    socket!.emit('identity:rename', { pseudo }, (res: { ok?: boolean; error?: string; me?: Person }) => {
      if (res?.ok && res.me) {
        s().updateMe(res.me);
        // La mémoire d'onglet doit suivre, sinon un rechargement ressusciterait
        // l'ancien pseudo.
        const saved = recallIdentity();
        if (saved) rememberIdentity({ ...saved, pseudo: res.me.pseudo });
        resolve({ ok: true });
      } else {
        resolve({ ok: false, error: res?.error || 'Échec du changement de pseudo.' });
      }
    });
  });
}

function startHeartbeat() {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = setInterval(() => socket?.emit('heartbeat'), 30000);
}

/**
 * Résout le correspondant d'un MP, et le mémorise au premier ENVOI — pas
 * seulement à la réception.
 *
 * Sans cela, écrire à une personne proche qui ne répond pas ne laisse aucune
 * trace d'elle : dès qu'elle quitte le rayon, son profil sort de `people` et la
 * conversation disparaît de la barre latérale, le fil survivant dans `threads`
 * sans plus personne à qui l'attacher. C'est la condition pour qu'une
 * conversation reste en place quand l'autre s'éloigne et passe seulement à
 * « hors de portée ».
 */
function resolvePmPeer(peerId: string): Person | null {
  const peer = s().people[peerId] || s().pmPeers[peerId];
  if (!peer?.pub) {
    s().showToast('Clé du destinataire introuvable.', 'warn');
    return null;
  }
  if (!s().pmPeers[peerId]) s().rememberPmPeer(peer);
  return peer;
}

export async function sendPM(peerId: string, text: string, replyTo?: string): Promise<void> {
  const peer = resolvePmPeer(peerId);
  if (!peer) return;
  // L'identifiant du message est forgé ici et scellé dans l'enveloppe : le serveur
  // ne peut ni le lire ni relier deux messages entre eux (RG-07).
  const msgId = newMessageId();
  const env = await encryptFor(peer.pub, encodeBody({ id: msgId, text, replyTo }));
  socket?.emit('pm:send', { toId: peerId, env, ts: now() });
  s().pushMessage(`pm:${peerId}`, { kind: 'me', msgId, text, ts: now(), encrypted: true, replyTo });
}

export async function sendPMMedia(peerId: string, file: File, replyTo?: string): Promise<void> {
  const peer = resolvePmPeer(peerId);
  if (!peer) return;
  let media;
  try {
    media = await prepareMedia(file);
  } catch (e) {
    s().showToast((e as Error).message, 'warn');
    return;
  }
  const msgId = newMessageId();
  const { nonce, cipher } = encryptBytesFor(peer.pub, media.bytes);
  const env: PmEnvelope = {
    n: nonce,
    c: '',
    pub: exportPublicKey(),
    mime: media.mime,
    media: media.kind,
    body: encryptFor(peer.pub, encodeBody({ id: msgId, text: '', replyTo })),
  };
  socket?.emit('pm:send', { toId: peerId, kind: 'media', env, data: cipher, ts: now() });
  s().pushMessage(`pm:${peerId}`, {
    kind: 'me',
    msgId,
    text: '',
    media: { url: blobUrl(media.bytes, media.mime), mime: media.mime, kind: media.kind },
    ts: now(),
    encrypted: true,
    replyTo,
  });
}

export async function sendRoomMedia(roomId: string, file: File, replyTo?: string): Promise<void> {
  let media;
  try {
    media = await prepareMedia(file);
  } catch (e) {
    s().showToast((e as Error).message, 'warn');
    return;
  }
  const key = s().roomKeys[roomId];
  if (key) {
    // Salon chiffré : octets chiffrés en secretbox, nonce dans l'enveloppe, mime/kind en clair (rendu).
    // La réponse citée passe par un corps scellé à part (`body`), pas en clair.
    const { nonce, cipher } = encryptRoomBytes(key, media.bytes);
    const env: RoomEnvelope & { body?: RoomEnvelope } = { n: nonce, c: '' };
    if (replyTo) env.body = encryptRoom(key, encodeBody({ text: '', replyTo }));
    socket?.emit('room:message', { roomId, kind: 'media', mime: media.mime, media: media.kind, env, data: cipher, ts: now() });
  } else {
    socket?.emit('room:message', { roomId, kind: 'media', mime: media.mime, media: media.kind, data: media.bytes, replyTo, ts: now() });
  }
}

export function refreshRooms(): void {
  socket?.emit('room:list', (res: { ok?: boolean; rooms?: RoomSummary[] }) => {
    if (res?.rooms) s().setPublicRooms(res.rooms);
  });
}

export function refreshPresence(): void {
  socket?.emit('presence:list', (res: { ok?: boolean; profiles?: Person[] }) => {
    if (res?.profiles) s().setPeople(res.profiles);
  });
}

type CreateForm = { name: string; type: 'public' | 'private'; password?: string; encrypted?: boolean };

export async function createRoom(form: CreateForm): Promise<{ ok: boolean; error?: string; roomId?: string }> {
  // Salon chiffré : on génère le sel, on dérive {verifier, key} côté client et on n'envoie
  // au serveur QUE le verifier + le sel public (jamais le mot de passe ni la clé).
  let payload: Record<string, unknown> = { name: form.name, type: form.type, password: form.password };
  let key: Uint8Array | undefined;
  let password: string | undefined;
  if (form.encrypted && form.password) {
    const salt = genRoomSalt();
    const mat = await deriveRoomMaterial(form.password, salt);
    key = mat.key;
    password = form.password;
    payload = { name: form.name, type: 'private', encrypted: '1', verifier: mat.verifier, salt };
  }
  return new Promise((resolve) => {
    socket?.emit('room:create', payload, (res: { ok?: boolean; error?: string; room?: JoinedRoom; invite?: string; owner?: string; members?: RoomMember[] }) => {
      if (res?.ok && res.room) {
        s().upsertJoinedRoom({ ...res.room, owner: res.owner!, members: res.members || [], invite: res.invite });
        if (key && password) s().setRoomKey(res.room.id, key, password);
        s().setActive({ kind: 'room', id: res.room.id });
        resolve({ ok: true, roomId: res.room.id });
      } else resolve({ ok: false, error: res?.error });
    });
  });
}

type PeekResult = { ok: boolean; name?: string; encrypted?: boolean; salt?: string; error?: string };

/** Pré-vol d'un salon (avant join) : récupère nom + flag chiffré + sel public pour dériver la clé. */
export function peekRoom(roomId: string): Promise<PeekResult> {
  return new Promise((resolve) => {
    socket?.emit('room:peek', { roomId }, (res: PeekResult) =>
      resolve({ ok: !!res?.ok, name: res?.name, encrypted: res?.encrypted, salt: res?.salt, error: res?.error }),
    );
  });
}

// Pour un salon chiffré, fournir `password` ET `salt` (depuis le listing ou peekRoom) : la clé est
// dérivée ici et seul le `verifier` part au serveur. Pour un salon clair : `password`/`invite` classiques.
type JoinForm = { roomId: string; password?: string; invite?: string; salt?: string };

export async function joinRoom(form: JoinForm): Promise<{ ok: boolean; error?: string }> {
  let key: Uint8Array | undefined;
  let payload: Record<string, unknown> = { roomId: form.roomId, password: form.password, invite: form.invite };
  if (form.salt && form.password) {
    const mat = await deriveRoomMaterial(form.password, form.salt);
    key = mat.key;
    payload = { roomId: form.roomId, verifier: mat.verifier };
  }
  return new Promise((resolve) => {
    socket?.emit('room:join', payload, (res: { ok?: boolean; error?: string; room?: JoinedRoom; owner?: string; members?: RoomMember[] }) => {
      if (res?.ok && res.room) {
        s().upsertJoinedRoom({ ...res.room, owner: res.owner!, members: res.members || [] });
        if (key && form.password) s().setRoomKey(res.room.id, key, form.password);
        s().setActive({ kind: 'room', id: res.room.id });
        resolve({ ok: true });
      } else resolve({ ok: false, error: res?.error });
    });
  });
}

export function sendRoomMessage(roomId: string, text: string, replyTo?: string): void {
  const key = s().roomKeys[roomId];
  if (key) {
    // Salon chiffré : la référence de réponse est scellée avec le texte — le serveur
    // relaie une enveloppe opaque et ignore jusqu'au graphe des réponses.
    socket?.emit('room:message', { roomId, env: encryptRoom(key, encodeBody({ text, replyTo })), ts: now() });
  } else {
    // Salon en clair : seul l'identifiant du message cité circule, jamais son contenu.
    socket?.emit('room:message', { roomId, text, replyTo, ts: now() });
  }
}

// --- Signalement (DSA art.16 notice-and-action) ----------------------------
type ReportResult = { ok: boolean; error?: string };

/** Signale un message de salon public (le serveur en a vu le contenu en clair). */
export function reportRoomMessage(
  roomId: string,
  messageId: string,
  content: string,
  authorId: string | undefined,
  reason: string,
): Promise<ReportResult> {
  return new Promise((resolve) => {
    socket?.emit('room:report', { roomId, messageId, content, authorId, reason }, (res: ReportResult) =>
      resolve({ ok: !!res?.ok, error: res?.error }),
    );
  });
}

/**
 * Signale un MP chiffré : le clair est fourni VOLONTAIREMENT (on l'a déchiffré
 * localement). Le serveur ne peut pas en vérifier l'authenticité (E2E intact).
 */
export function reportPM(peerId: string, messageId: string, content: string, reason: string): Promise<ReportResult> {
  return new Promise((resolve) => {
    socket?.emit('pm:report', { peerId, messageId, content, reason }, (res: ReportResult) =>
      resolve({ ok: !!res?.ok, error: res?.error }),
    );
  });
}

// Signal « en train d'écrire » — throttlé pour ne pas spammer le serveur.
let lastTypingAt = 0;
let lastTypingKey = '';
export function sendTyping(scope: 'pm' | 'room', id: string): void {
  const key = `${scope}:${id}`;
  const t = now();
  if (key === lastTypingKey && t - lastTypingAt < 2000) return;
  lastTypingAt = t;
  lastTypingKey = key;
  if (scope === 'pm') socket?.emit('typing', { scope, toId: id });
  else socket?.emit('typing', { scope, roomId: id });
}

export function leaveRoom(roomId: string): void {
  socket?.emit('room:leave', { roomId });
  s().removeJoinedRoom(roomId);
}

/* ---- Continuer en privé, depuis la liste des présents --------------------
 */

/**
 * Ouvre la conversation privée avec un·e présent·e du salon.
 *
 * Deux chemins, et c'est tout l'objet de la fonction : si la personne est dans le
 * rayon (ou qu'on lui a déjà écrit), sa clé est déjà là et le fil s'ouvre sans
 * aller-retour. Sinon on la demande au serveur, qui ne la donne qu'à un co-présent
 * (`pm:key`). Sans ce second chemin, le bouton n'aurait marché que pour les
 * membres proches et échoué sur « Clé du destinataire introuvable » pour les
 * autres — une commande qui marche une fois sur deux sans raison visible.
 *
 * Le message système d'ouverture a la même fonction que dans le parcours par lien
 * (cf. `openInvitedThread`) : la barre latérale ne liste une conversation que si
 * son fil porte au moins un message. Il dit aussi d'où vient la personne, ce qu'on
 * aura oublié demain. Il n'est poussé qu'à la naissance du fil — rouvrir une
 * conversation existante n'y réécrit rien.
 */
export async function openPmWithMember(
  roomId: string,
  member: RoomMember,
  roomName: string,
): Promise<{ ok: boolean; error?: string }> {
  const known = s().people[member.id] || s().pmPeers[member.id];
  if (known?.pub) {
    openMemberThread(known, roomName);
    return { ok: true };
  }
  const res = await new Promise<{ ok?: boolean; peer?: RoomMember & { pub: string }; error?: string }>((resolve) => {
    socket?.emit('pm:key', { roomId, peerId: member.id }, resolve);
  });
  if (!res?.ok || !res.peer?.pub) {
    const error = res?.error || 'La conversation n’a pas pu être ouverte.';
    s().showToast(error, 'warn');
    return { ok: false, error };
  }
  openMemberThread(peerFromMember(res.peer), roomName);
  return { ok: true };
}

function openMemberThread(peer: Person, roomName: string): void {
  s().rememberPmPeer(peer);
  if (!s().threads[`pm:${peer.id}`]?.length) {
    s().pushMessage(`pm:${peer.id}`, {
      kind: 'system',
      text: `Conversation ouverte depuis ${roomName}. Vous seuls pouvez la lire.`,
      ts: now(),
    });
  }
  s().setActive({ kind: 'pm', id: peer.id });
}

export function kickMember(roomId: string, targetId: string): void {
  socket?.emit('room:kick', { roomId, targetId }, (res: { ok?: boolean; error?: string }) => {
    if (res?.error) s().showToast(res.error, 'warn');
  });
}

export function closeRoom(roomId: string): void {
  socket?.emit('room:close', { roomId }, () => s().removeJoinedRoom(roomId));
}

export function setRoomPassword(roomId: string, password: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    socket?.emit('room:password', { roomId, password }, (res: { ok?: boolean; error?: string }) =>
      resolve({ ok: !!res?.ok, error: res?.error }),
    );
  });
}

/* ---- Invitation à une conversation privée par lien ----
   Un lien de rendez-vous : il ne vaut que tant que cet onglet est ouvert. */

type InviteAck = { ok?: boolean; token?: string; pseudo?: string; peer?: Person; error?: string; gone?: boolean };

/** Ouvre un lien d'invitation. Un seul est vivant à la fois (cf. `invites.js`). */
export function createInvite(): Promise<{ ok: boolean; token?: string; error?: string }> {
  // La permission de notifier se demande ICI, et nulle part ailleurs : c'est le
  // seul instant où l'attente est une intention explicite, donc où la question a
  // du sens pour la personne. Non bloquante — le parcours n'en dépend pas.
  try {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
  } catch {
    /* sans gravité */
  }
  return new Promise((resolve) => {
    socket?.emit('pm:invite:create', {}, (res: InviteAck) => {
      if (res?.ok && res.token) {
        s().setInvite({ token: res.token, guest: null });
        resolve({ ok: true, token: res.token });
      } else resolve({ ok: false, error: res?.error });
    });
  });
}

/** Pré-vol, avant toute identité : à qui répond-on ? N'engage rien. */
export function peekInvite(token: string): Promise<{ ok: boolean; pseudo?: string; error?: string }> {
  return new Promise((resolve) => {
    socket?.emit('pm:invite:peek', { token }, (res: InviteAck) =>
      resolve({ ok: !!res?.ok, pseudo: res?.pseudo, error: res?.error }),
    );
  });
}

/** Se présenter à l'auteur du lien, et attendre son accord. */
export function claimInvite(token: string): Promise<{ ok: boolean; pseudo?: string; error?: string }> {
  return new Promise((resolve) => {
    socket?.emit('pm:invite:claim', { token }, (res: InviteAck) => {
      if (res?.ok && res.pseudo) s().setAwaitingInvite({ pseudo: res.pseudo });
      resolve({ ok: !!res?.ok, pseudo: res?.pseudo, error: res?.error });
    });
  });
}

export function acceptInvite(token: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    socket?.emit('pm:invite:accept', { token }, (res: InviteAck) => {
      if (res?.ok && res.peer) {
        s().setInvite(null);
        openInvitedThread(res.peer);
        return resolve({ ok: true });
      }
      // Le lien n'existe plus (correspondant·e parti·e, invitation expirée) : on
      // retire la fiche plutôt que de laisser proposer une ouverture impossible.
      // Le message passe alors en bandeau — il n'y a plus de fiche pour le porter.
      if (res?.gone) {
        s().setInvite(null);
        s().showToast(res.error || 'Cette invitation a expiré.', 'warn');
        return resolve({ ok: false });
      }
      resolve({ ok: false, error: res?.error });
    });
  });
}

/** Refuser l'arrivant, ou simplement retirer son lien : même geste, l'invitation disparaît. */
export function revokeInvite(token: string): void {
  socket?.emit('pm:invite:revoke', { token });
  s().setInvite(null);
}

export function disconnect(): void {
  if (heartbeat) clearInterval(heartbeat);
  // Départ volontaire (« quitter et tout détruire ») : la mémoire d'onglet part
  // avec le reste. Sans cela, le rechargement qui suit nous ré-identifierait
  // aussitôt — exactement le contraire de ce qui vient d'être demandé.
  forgetIdentity();
  socket?.disconnect();
}
