<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref } from 'vue';
import { useStore } from '../../store/useStore';
import {
  closeRoom,
  editRoomMessage,
  reportRoomMessage,
  sendRoomMedia,
  sendRoomMessage,
  sendTyping,
  setRoomPassword,
} from '../../lib/socket';
import { type JoinedRoom, type Message, type ReportReason } from '../../lib/types';
import Composer from '../chat/Composer.vue';
import RoomCard from '../rooms/RoomCard.vue';
import { Avatar, Icon, Modal } from '../ui';
import EmptyState from './EmptyState.vue';
import BackBar from './BackBar.vue';
import ThreadSheet from './ThreadSheet.vue';
import ThreadStart from './ThreadStart.vue';
import TypingIndicator from './TypingIndicator.vue';
import { editDraft, replyDraft } from './shared';
import MembersPanel from './Members.vue';
import MessageList from './MessageList.vue';

const props = defineProps<{ roomId: string }>();
const st = useStore();

const room = computed(() => st.joinedRooms[props.roomId]);
const me = computed(() => st.me!);
const messages = computed(() => st.threads[`room:${props.roomId}`] || []);
// Mot de passe du salon chiffré conservé en RAM (pour « copier » / lien tout-en-un). Perdu au reload.
const roomPassword = computed(() => st.roomPasswords[props.roomId]);
// Liste des présents : colonne à droite en desktop, panneau glissant en mobile.
// Ouverte d'office à partir de 1280 px : en dessous, elle prendrait 224 px à la
// colonne de lecture sur les portables, là où ça coûte le plus. La barre de
// présence de l'en-tête dit déjà qui est là, et permet de l'ouvrir d'un clic.
//
// Elle s'ouvre MÊME SEUL·E : la conditionner à l'affluence rendrait la mise en
// page instable, l'état initial ne s'évaluant qu'au montage — on entrerait dans
// un salon vide sans colonne, et l'arrivée d'un second présent ne l'ouvrirait
// pas pour autant.
const showMembers = ref(window.matchMedia('(min-width: 1280px)').matches);
const menu = ref(false);
const pwdModal = ref(false);
const leaving = ref(false);
const replyTo = ref<Message | null>(null);
// Message que l'on retouche. Exclusif de la réponse : le champ de saisie ne peut
// pas servir aux deux à la fois, et prétendre le contraire tromperait sur ce que
// Entrée va faire.
const editing = ref<Message | null>(null);
// Sortir annonce le départ aux présents, et peut effacer le salon (RG-05) : la même
// fiche que dans la liste le dit avant d'agir, plutôt qu'une ligne de menu muette.
const listed = computed(() => st.publicRooms.find((r) => r.id === props.roomId));
const homeRoom = computed(() => st.homeRoom);

const isOwner = computed(() => !!room.value && room.value.owner === me.value.id);

const onReport = (m: Message, reason: ReportReason) =>
  reportRoomMessage(props.roomId, m.msgId || '', m.media ? '(média)' : m.text, m.fromId, reason).then((res) =>
    st.showToast(
      res.ok ? 'Signalement transmis à la modération.' : res.error || 'Échec du signalement.',
      res.ok ? 'info' : 'warn',
    ),
  );

function copyText(text: string, okMsg: string) {
  navigator.clipboard?.writeText(text).then(
    () => st.showToast(okMsg),
    () => st.showToast(text, 'info'),
  );
  menu.value = false;
}

function shareLink() {
  // Un salon PUBLIC se partage par son seul identifiant : il n'a ni mot de passe à
  // joindre ni invitation à réserver au créateur — sa clé lui sera remise à l'entrée.
  // Le critère est le TYPE, pas le régime de clé : un salon privé sur invitation est
  // en régime de groupe lui aussi, mais son lien doit porter le jeton.
  if (room.value && room.value.type !== 'private') {
    copyText(`${window.location.origin}/?r=${room.value.id}`, 'Lien du salon copié.');
    return;
  }
  if (room.value?.keyMode === 'password') {
    // Lien tout-en-un : le mot de passe voyage dans le fragment `#p=` (jamais envoyé au serveur).
    if (!roomPassword.value) {
      st.showToast('Ressaisissez le mot de passe pour générer le lien.', 'warn');
      return;
    }
    copyText(
      `${window.location.origin}/?r=${room.value.id}#p=${encodeURIComponent(roomPassword.value)}`,
      'Lien d’accès (mot de passe inclus) copié.',
    );
    return;
  }
  if (!room.value?.invite) {
    st.showToast("Lien d'invitation disponible uniquement pour le créateur.", 'warn');
    return;
  }
  copyText(`${window.location.origin}/?r=${room.value.id}&k=${room.value.invite}`, 'Lien d’invitation copié.');
}

function confirmClose() {
  if (window.confirm('Fermer le salon pour tout le monde ?')) closeRoom(props.roomId);
  menu.value = false;
}

function onSend(t: string) {
  if (editing.value?.msgId) {
    editRoomMessage(props.roomId, editing.value.msgId, t);
    editing.value = null;
    return;
  }
  sendRoomMessage(props.roomId, t, replyTo.value?.msgId);
  replyTo.value = null;
}

function onMediaFile(f: File) {
  sendRoomMedia(props.roomId, f, replyTo.value?.msgId);
  replyTo.value = null;
}

function onReplyPick(m: Message) {
  editing.value = null;
  replyTo.value = m;
}

function onEditPick(m: Message) {
  replyTo.value = null;
  editing.value = m;
}

/* Qui est là, maintenant — la seule chose vraiment caractéristique d'un salon de
   proximité. Les visages portent la couleur déterministe de leur auteur, la même que
   le liseré de leurs bulles : la couleur devient le fil conducteur de l'écran. La
   barre *est* le compte et *est* la commande — l'ancien « 2 membres · masquer »
   faisait tenir une information et un verbe dans le même lien de 11 px. */

const PresenceBar = defineComponent(
  (p: { members: JoinedRoom['members']; open: boolean; onToggle: () => void }) => {
    return () => {
      const shown = p.members.slice(0, 5);
      const rest = p.members.length - shown.length;
      return h(
        'button',
        {
          class: 'presence',
          onClick: p.onToggle,
          'aria-expanded': p.open,
          title: p.open ? 'Masquer la liste des présents' : 'Voir la liste des présents',
        },
        [
          h('span', { class: 'presence__stack' }, [
            ...shown.map((m) => h(Avatar, { key: m.id, id: m.id, pseudo: m.pseudo, size: 20 })),
            rest > 0 ? h('span', { class: 'presence__more' }, `+${rest}`) : null,
          ]),
          h('span', { class: 'presence__count' }, `${p.members.length} présent${p.members.length > 1 ? 's' : ''}`),
        ],
      );
    };
  },
  { props: ['members', 'open', 'onToggle'] },
);

const MenuItem = defineComponent(
  (p: { icon: string; label: string; onClick: () => void; danger?: boolean }) => {
    return () =>
      h(
        'button',
        {
          class: `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-paper-2 ${
            p.danger ? 'text-danger' : 'text-ink'
          }`,
          onClick: p.onClick,
        },
        [h(Icon, { name: p.icon, size: 15 }), p.label],
      );
  },
  { props: ['icon', 'label', 'onClick', 'danger'] },
);

const PasswordModal = defineComponent(
  (p: { roomId: string; onClose: () => void; onDone: () => void }) => {
    const pwd = ref('');
    const busy = ref(false);
    const input = ref<HTMLInputElement | null>(null);
    onMounted(() => input.value?.focus());
    return () =>
      h(Modal, { title: 'Mot de passe du salon', onClose: p.onClose }, () => [
        h(
          'p',
          { class: 'mb-3 text-sm text-muted' },
          "Laissez vide pour retirer le mot de passe. Les personnes disposant du lien d'invitation pourront toujours entrer.",
        ),
        h('input', {
          ref: input,
          class: 'input mb-4',
          type: 'text',
          placeholder: 'Nouveau mot de passe',
          value: pwd.value,
          maxlength: 64,
          onInput: (e: Event) => {
            pwd.value = (e.target as HTMLInputElement).value;
          },
        }),
        h('div', { class: 'flex justify-end gap-2' }, [
          h('button', { class: 'btn btn-ghost', onClick: p.onClose }, 'Annuler'),
          h(
            'button',
            {
              class: 'btn btn-primary',
              disabled: busy.value,
              onClick: async () => {
                busy.value = true;
                const res = await setRoomPassword(p.roomId, pwd.value);
                busy.value = false;
                if (res.ok) {
                  p.onDone();
                  p.onClose();
                }
              },
            },
            'Enregistrer',
          ),
        ]),
      ]);
  },
  { props: ['roomId', 'onClose', 'onDone'] },
);

/* ---- Indicateur « est en train d'écrire » ------------------------------ */
</script>

<template>
  <EmptyState v-if="!room" />
  <div v-else class="flex h-full flex-col">
    <BackBar>
      <span
        class="grid h-9 w-9 flex-none place-items-center rounded-[9px]"
        :style="{ background: 'var(--color-blue-tint)', color: 'var(--color-blue)' }"
      >
        <Icon name="hash" :size="17" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h2 class="thread-title truncate">{{ room.name }}</h2>
          <!-- Deux étiquettes, parce qu'elles ne disent plus la même chose : la nature du
               salon (qui peut y entrer) et son chiffrement (qui peut le lire). Tous les
               salons étant chiffrés, garder la seule mention « chiffré » aurait effacé
               la première — or c'est elle qui change quelque chose au geste suivant.
               Pas de second « # » : le bloc d'icône à gauche du nom le porte déjà. -->
          <span :class="`chip ${room.type === 'private' ? '' : 'chip-blue'}`">
            <Icon v-if="room.type === 'private'" name="lock" :size="10" />
            {{ room.type === 'private' ? 'privé' : 'public' }}
          </span>
          <span
            v-if="room.encrypted"
            class="chip chip-verified"
            :title="
              room.keyMode === 'password'
                ? 'Chiffré de bout en bout — clé dérivée du mot de passe, jamais transmise au serveur'
                : 'Chiffré de bout en bout — l’hébergeur ne peut pas lire ce salon ; toute personne qui y entre en reçoit la clé'
            "
          >
            <Icon name="lock" :size="10" />
            chiffré
          </span>
        </div>
        <PresenceBar :members="room.members" :open="showMembers" :onToggle="() => (showMembers = !showMembers)" />
      </div>

      <div class="relative">
        <button class="btn btn-ghost px-2.5" aria-label="Options du salon" @click="menu = !menu">
          <Icon name="dots" :size="18" />
        </button>
        <template v-if="menu">
          <div class="fixed inset-0 z-10" @click="menu = false" />
          <div class="panel absolute right-0 z-20 mt-1.5 w-52 overflow-hidden p-1.5 text-sm">
            <template v-if="room.keyMode === 'password'">
              <MenuItem icon="key" label="Copier le lien d'accès" :onClick="shareLink" />
              <MenuItem
                v-if="roomPassword"
                icon="lock"
                label="Copier le mot de passe"
                :onClick="() => copyText(roomPassword!, 'Mot de passe copié.')"
              />
            </template>
            <template v-else>
              <!-- Salon public : le lien n'est réservé à personne. Salon privé sur
                   invitation : le jeton reste au créateur, c'est lui qui tient la porte. -->
              <MenuItem
                v-if="room.type !== 'private' || (isOwner && room.invite)"
                icon="key"
                label="Partager le lien"
                :onClick="shareLink"
              />
              <MenuItem
                v-if="isOwner && room.type === 'private'"
                icon="lock"
                label="Mot de passe"
                :onClick="() => { pwdModal = true; menu = false; }"
              />
            </template>
            <MenuItem icon="logout" label="Sortir du salon" :onClick="() => { leaving = true; menu = false; }" />
            <MenuItem v-if="isOwner" icon="close" label="Fermer le salon" :danger="true" :onClick="confirmClose" />
          </div>
        </template>
      </div>
    </BackBar>

    <div class="relative flex min-h-0 flex-1">
      <!-- Zone de conversation (rétrécit en largeur, jamais en hauteur, quand le panneau est ouvert). -->
      <ThreadSheet>
        <MessageList
          :messages="messages"
          showNames
          :onReport="onReport"
          :onReply="onReplyPick"
          :onEdit="onEditPick"
          :editingId="editing?.msgId"
          :mentionPseudos="room.members.map((m) => m.pseudo)"
          :myPseudo="me.pseudo"
        >
          <template #empty>
            <ThreadStart :title="`Personne n'a encore écrit dans ${room.name}.`">
              Les messages vivent le temps de la séance. Il n'y a pas d'historique à remonter&nbsp;: ce qui se dit
              ici disparaît avec les présents.
            </ThreadStart>
          </template>
        </MessageList>

        <TypingIndicator :convKey="`room:${roomId}`" />
        <!-- `mentionables` : on ne se propose pas à soi-même — s'interpeller n'apprend rien à personne. -->
        <Composer
          :placeholder="`Message dans ${room.name}`"
          :onSend="onSend"
          :onTyping="() => sendTyping('room', roomId)"
          :onMedia="onMediaFile"
          :reply="replyDraft(replyTo)"
          :onCancelReply="() => (replyTo = null)"
          :edit="editDraft(editing)"
          :onCancelEdit="() => (editing = null)"
          :mentionables="room.members.filter((m) => m.id !== me.id)"
        />
      </ThreadSheet>

      <!-- Liste des membres : colonne latérale (desktop) ou panneau glissant (mobile). -->
      <MembersPanel
        :room="room"
        :meId="me.id"
        :isOwner="isOwner"
        :roomId="roomId"
        :open="showMembers"
        :onClose="() => (showMembers = false)"
      />
    </div>

    <PasswordModal
      v-if="pwdModal"
      :roomId="roomId"
      :onClose="() => (pwdModal = false)"
      :onDone="() => st.showToast('Mot de passe du salon mis à jour.')"
    />

    <!-- `alone` : RG-05 — un salon éphémère laissé vide disparaît, jamais un permanent. -->
    <RoomCard
      v-if="leaving"
      :room="{
        id: roomId,
        name: room.name,
        region: roomId === homeRoom?.id,
        official: !!listed?.persistent,
        encrypted: !!room.encrypted,
        locked: room.keyMode === 'password',
        private: room.type === 'private',
        count: room.members.length,
        alone: room.members.length <= 1 && !listed?.persistent,
      }"
      mode="leave"
      layout="dialog"
      :onDone="() => (leaving = false)"
      :onCancel="() => (leaving = false)"
    />
  </div>
</template>
