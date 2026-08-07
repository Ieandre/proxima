<script setup lang="ts">
import { computed, ref } from 'vue';
import { useStore } from '../../store/useStore';
import { editPM, reportPM, sendPM, sendPMMedia, sendTyping } from '../../lib/socket';
import { safetyNumber } from '../../lib/crypto';
import { GENDER_LABEL, type Message, type ReportReason } from '../../lib/types';
import Composer from '../chat/Composer.vue';
import { Avatar, Icon } from '../ui';
import BackBar from './BackBar.vue';
import ThreadSheet from './ThreadSheet.vue';
import ThreadStart from './ThreadStart.vue';
import TypingIndicator from './TypingIndicator.vue';
import { editDraft, replyDraft } from './shared';
import MessageList from './MessageList.vue';

const props = defineProps<{ peerId: string }>();
const st = useStore();

const peer = computed(() => st.people[props.peerId] || st.pmPeers[props.peerId]);
const messages = computed(() => st.threads[`pm:${props.peerId}`] || []);
const showVerify = ref(false);
const verified = ref(false);
const replyTo = ref<Message | null>(null);
// Message que l'on retouche — exclusif de la réponse (même champ de saisie).
const editing = ref<Message | null>(null);

const onReport = (m: Message, reason: ReportReason) =>
  reportPM(props.peerId, m.msgId || m.localId, m.media ? '(média)' : m.text, reason).then((res) =>
    st.showToast(
      res.ok ? 'Signalement transmis à la modération.' : res.error || 'Échec du signalement.',
      res.ok ? 'info' : 'warn',
    ),
  );

const sn = computed(() => {
  try {
    return peer.value?.pub ? safetyNumber(peer.value.pub) : '';
  } catch {
    return '';
  }
});

function onSend(t: string) {
  if (editing.value?.msgId) {
    editPM(props.peerId, editing.value.msgId, t);
    editing.value = null;
    return;
  }
  sendPM(props.peerId, t, replyTo.value?.msgId);
  replyTo.value = null;
}

function onMediaFile(f: File) {
  sendPMMedia(props.peerId, f, replyTo.value?.msgId);
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

/* ---- Salons ------------------------------------------------------------ */
</script>

<template>
  <div class="flex h-full flex-col">
    <BackBar>
      <Avatar v-if="peer" :id="peer.id" :pseudo="peer.pseudo" :size="38" />
      <div class="min-w-0 flex-1">
        <h2 class="thread-title truncate">{{ peer?.pseudo || 'Inconnu' }}</h2>
        <div class="mt-0.5 text-[11.5px] text-faint">
          {{ peer?.city ? `${peer.city} · ${peer.age} ans · ${GENDER_LABEL[peer.gender]}` : 'hors de portée' }}
        </div>
      </div>
      <button
        :class="`chip ${verified ? 'chip-verified' : 'chip-blue'} cursor-pointer`"
        title="Empreinte de sécurité de la conversation"
        @click="showVerify = !showVerify"
      >
        <Icon :name="verified ? 'check' : 'lock'" :size="11" />
        {{ verified ? 'vérifié' : 'chiffré' }}
      </button>
    </BackBar>

    <div v-if="showVerify" class="fade-up border-b border-line bg-paper-2 px-4 py-3.5">
      <div class="flex items-start gap-3">
        <span
          class="grid h-9 w-9 flex-none place-items-center rounded-[9px]"
          :style="{ background: 'var(--color-verified-tint)', color: 'var(--color-verified)' }"
        >
          <Icon name="shield-check" :size="18" />
        </span>
        <div class="min-w-0">
          <div class="text-sm font-semibold">Empreinte de sécurité</div>
          <p class="mt-0.5 text-[12px] leading-snug text-muted">
            Comparez ce code avec {{ peer?.pseudo || 'votre interlocuteur·rice' }} par un autre canal (à voix haute, en
            personne…). S'il diffère de son côté, la connexion est peut-être interceptée.
          </p>
          <div class="mt-2 select-all font-mono text-[13px] tracking-wider text-ink">{{ sn || '—' }}</div>
          <button class="btn btn-ghost mt-2.5 px-3 py-1.5 text-xs" :disabled="!sn" @click="verified = !verified">
            <Icon :name="verified ? 'close' : 'check'" :size="13" />
            {{ verified ? 'Retirer la vérification' : 'Marquer comme vérifié' }}
          </button>
        </div>
      </div>
    </div>

    <ThreadSheet>
      <MessageList
        :messages="messages"
        :showNames="false"
        :onReport="onReport"
        :onReply="onReplyPick"
        :onEdit="onEditPick"
        :editingId="editing?.msgId"
      >
        <template #empty>
          <ThreadStart :title="`Votre conversation avec ${peer?.pseudo || 'cette personne'} commence ici.`">
            Chaque message est chiffré sur votre appareil&nbsp;: le serveur transporte un bloc qu'il ne peut pas
            ouvrir. Pour être sûr·e de parler à la bonne personne, comparez l'empreinte de sécurité.
          </ThreadStart>
        </template>
      </MessageList>

      <TypingIndicator :convKey="`pm:${peerId}`" />
      <Composer
        :placeholder="`Message chiffré à ${peer?.pseudo || '…'}`"
        :onSend="onSend"
        :onTyping="() => sendTyping('pm', peerId)"
        :onMedia="onMediaFile"
        :reply="replyDraft(replyTo)"
        :onCancelReply="() => (replyTo = null)"
        :edit="editDraft(editing)"
        :onCancelEdit="() => (editing = null)"
      />
    </ThreadSheet>
  </div>
</template>
