<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { mediaFromClipboard } from '../../lib/media';
import { applyMention, mentionQuery } from '../../lib/mentions';
import type { RoomMember } from '../../lib/types';
import { Avatar, Icon } from '../ui';
import type { EditDraft, ReplyDraft } from './drafts';

const MAX_SUGGESTIONS = 6;

/** Le champ prend la hauteur de son contenu, borné — à la frappe comme au chargement d'un texte à retoucher. */
function fitHeight(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

const props = defineProps<{
  onSend: (text: string) => void;
  placeholder: string;
  onTyping?: () => void;
  onMedia?: (file: File) => void;
  reply?: ReplyDraft | null;
  onCancelReply?: () => void;
  /**
   * Modification en cours. Le champ de saisie sert aussi à retoucher : la
   * frappe, l'auto-complétion des mentions et Entrée valent déjà là, et une
   * seconde zone d'édition dans la bulle les redemanderait toutes.
   */
  edit?: EditDraft | null;
  onCancelEdit?: () => void;
  /** Présents que l'on peut interpeller — absent en MP, où il n'y a qu'un interlocuteur. */
  mentionables?: RoomMember[];
}>();

const text = ref('');
// Mention en cours de frappe : position du « @ » et requête saisie derrière.
const pending = ref<{ start: number; query: string; caret: number } | null>(null);
const highlighted = ref(0);
/**
 * Média collé au presse-papiers, en attente de confirmation. Le trombone envoie
 * sur-le-champ — le choix du fichier est un geste explicite, avec son propre
 * aperçu dans la boîte de dialogue du système. Un Cmd+V, lui, est une frappe :
 * il peut lâcher dans un salon public une capture qu'on avait copiée pour tout
 * autre chose. D'où cet arrêt avant envoi, propre au collage.
 */
const pasted = ref<{ file: File; url: string; kind: 'image' | 'video' } | null>(null);
const fileRef = ref<HTMLInputElement | null>(null);
const areaRef = ref<HTMLTextAreaElement | null>(null);
// Message en cours de rédaction, mis de côté le temps d'une modification.
// `null` = on ne modifie rien, donc rien n'est en attente d'être rendu.
let parkedDraft: string | null = null;

const suggestions = computed(() => {
  if (!pending.value || !props.mentionables?.length) return [];
  const q = pending.value.query.toLowerCase();
  return props.mentionables.filter((m) => m.pseudo.toLowerCase().includes(q)).slice(0, MAX_SUGGESTIONS);
});

const open = computed(() => suggestions.value.length > 0);

/** Relit la mention en cours à partir de l'état réel du champ (frappe, clic, flèches). */
function syncPending(el: HTMLTextAreaElement) {
  if (!props.mentionables?.length) return;
  const caret = el.selectionStart ?? el.value.length;
  const found = mentionQuery(el.value, caret);
  pending.value = found ? { ...found, caret } : null;
  highlighted.value = 0;
}

function pick(pseudo: string) {
  if (!pending.value) return;
  const next = applyMention(text.value, pending.value.start, pending.value.caret, pseudo);
  text.value = next.text;
  pending.value = null;
  const el = areaRef.value;
  if (el) {
    // Le curseur doit repartir derrière le pseudo inséré, pas en fin de champ :
    // on complète souvent une mention au milieu d'une phrase déjà écrite.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  }
}

// Cliquer « répondre » doit poser le curseur dans le champ : sans cela, l'action
// se voit mais ne mène nulle part — il faut encore aller cliquer pour écrire.
function focusOnReply() {
  if (props.reply) areaRef.value?.focus();
}
watch(() => props.reply?.id, focusOnReply, { flush: 'post' });

// L'aperçu du collage tient par une URL d'objet : on la libère dès qu'elle est
// remplacée, retirée ou que le champ disparaît.
watch(pasted, (_, old) => {
  if (old) URL.revokeObjectURL(old.url);
});
onUnmounted(() => {
  if (pasted.value) URL.revokeObjectURL(pasted.value.url);
});

/** Retient le média collé, en libérant l'aperçu précédent (cf. le watcher ci-dessus). */
function attach(file: File) {
  pasted.value = { file, url: URL.createObjectURL(file), kind: file.type.startsWith('video/') ? 'video' : 'image' };
}

/**
 * Entrer en modification charge le texte d'origine ; en sortir — validée ou
 * abandonnée — rend le brouillon qu'on avait en cours. Sans cette mise de côté,
 * cliquer « modifier » au milieu d'une phrase l'effacerait sans recours.
 */
function applyEditState() {
  if (props.edit) {
    // Seulement à l'ENTRÉE : passer d'un message à l'autre ne doit pas prendre
    // la retouche en cours pour un brouillon.
    if (parkedDraft === null) parkedDraft = text.value;
    text.value = props.edit.text;
    areaRef.value?.focus();
  } else if (parkedDraft !== null) {
    text.value = parkedDraft;
    parkedDraft = null;
  } else {
    return; // premier rendu, rien à charger ni à rendre
  }
  pending.value = null;
  // Un collage en attente ne survit pas au passage en modification : contrairement
  // à un brouillon frappé, il est encore dans le presse-papiers — le recoller ne
  // coûte qu'une frappe, alors que le mettre de côté brouillerait ce que valide Entrée.
  pasted.value = null;
  // La hauteur se règle une image plus tard : le texte qu'on vient de poser
  // n'est pas encore dans le DOM, `scrollHeight` mesurerait l'ancien.
  requestAnimationFrame(() => {
    if (areaRef.value) fitHeight(areaRef.value);
  });
}
// Le texte n'est PAS observé : ce watcher ne joue qu'au passage d'un
// état à l'autre, sinon chaque frappe rechargerait le texte d'origine.
watch(() => props.edit?.id, applyEditState, { flush: 'post' });

// Les effets d'origine jouaient aussi au montage, dans cet ordre.
onMounted(() => {
  focusOnReply();
  applyEditState();
});

function send() {
  const t = text.value.trim();
  if (!t && !pasted.value) return;
  // Le média part avant le texte, qui le commente. Deux messages : sur le fil,
  // une pièce jointe ne transporte pas de légende.
  if (pasted.value) {
    props.onMedia?.(pasted.value.file);
    pasted.value = null;
  }
  if (t) props.onSend(t.slice(0, 2000));
  // Une modification validée n'a pas à effacer le champ elle-même : le parent
  // referme l'édition, ce qui rend son brouillon (cf. le watcher ci-dessus).
  if (!props.edit) text.value = '';
  pending.value = null;
  if (areaRef.value) areaRef.value.style.height = 'auto';
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  if (f) props.onMedia?.(f);
  input.value = '';
}

function onInput(e: Event) {
  const el = e.target as HTMLTextAreaElement;
  text.value = el.value;
  if (el.value.trim()) props.onTyping?.();
  syncPending(el);
  fitHeight(el);
}

function onPaste(e: ClipboardEvent) {
  // Coller une image ne vaut que là où une pièce jointe a un sens : pas en
  // modification, pas dans un fil qui n'en accepte pas.
  if (!props.onMedia || props.edit) return;
  const file = e.clipboardData ? mediaFromClipboard(e.clipboardData) : null;
  if (!file) return;
  // Le collage nous revient entièrement : au navigateur, plus rien à insérer.
  e.preventDefault();
  attach(file);
}

function onKeyDown(e: KeyboardEvent) {
  // La liste de mentions capte d'abord les touches de navigation : sans
  // cela, Entrée enverrait le message au lieu de valider le pseudo visé.
  if (open.value) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : suggestions.value.length - 1;
      highlighted.value = (highlighted.value + step) % suggestions.value.length;
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pick(suggestions.value[highlighted.value].pseudo);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      pending.value = null;
      return;
    }
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  } else if (e.key === 'Escape' && pasted.value) {
    // Le collage est le geste le plus récent : Échap le retire d'abord.
    e.preventDefault();
    pasted.value = null;
  } else if (e.key === 'Escape' && (props.edit || props.reply)) {
    // Échap abandonne la retouche ou la réponse en cours avant de
    // fermer quoi que ce soit d'autre.
    e.preventDefault();
    if (props.edit) props.onCancelEdit?.();
    else props.onCancelReply?.();
  }
}
</script>

<template>
  <div class="thread-composer relative border-t border-line bg-card px-3 py-3 sm:px-4">
    <ul v-if="open" class="mention-list fade-up" role="listbox" aria-label="Personnes à mentionner">
      <li v-for="(m, i) in suggestions" :key="m.id">
        <button
          type="button"
          role="option"
          :aria-selected="i === highlighted"
          :class="`mention-option ${i === highlighted ? 'mention-option--on' : ''}`"
          @mousedown.prevent="pick(m.pseudo)"
          @mouseenter="highlighted = i"
        >
          <!-- `mousedown` plutôt que `click` : au `blur` du champ la liste se
               ferme, et le clic n'arriverait jamais jusqu'ici. -->
          <Avatar :id="m.id" :pseudo="m.pseudo" :size="22" />
          <span class="truncate">{{ m.pseudo }}</span>
        </button>
      </li>
    </ul>

    <div v-if="edit" class="reply-bar reply-bar--edit fade-up">
      <div class="reply-bar__body">
        <div class="reply-bar__title">Modification du message</div>
        <div class="reply-bar__text">Entrée pour valider, Échap pour abandonner.</div>
      </div>
      <button
        class="reply-bar__close"
        @click="onCancelEdit"
        aria-label="Abandonner la modification"
        title="Abandonner la modification"
      >
        <Icon name="close" :size="14" />
      </button>
    </div>

    <div v-if="reply && !edit" class="reply-bar fade-up">
      <div class="reply-bar__body">
        <div class="reply-bar__title">Réponse à {{ reply.author }}</div>
        <div class="reply-bar__text">{{ reply.excerpt || '—' }}</div>
      </div>
      <button class="reply-bar__close" @click="onCancelReply" aria-label="Annuler la réponse" title="Annuler la réponse">
        <Icon name="close" :size="14" />
      </button>
    </div>

    <div v-if="pasted" class="reply-bar reply-bar--media fade-up">
      <img v-if="pasted.kind === 'image'" class="reply-bar__thumb" :src="pasted.url" alt="" />
      <video v-else class="reply-bar__thumb" :src="pasted.url" muted playsinline />
      <div class="reply-bar__body">
        <div class="reply-bar__title">{{ pasted.kind === 'image' ? 'Image collée' : 'Vidéo collée' }}</div>
        <div class="reply-bar__text">Entrée pour envoyer, Échap pour retirer.</div>
      </div>
      <button
        class="reply-bar__close"
        @click="pasted = null"
        aria-label="Retirer la pièce jointe collée"
        title="Retirer la pièce jointe collée"
      >
        <Icon name="close" :size="14" />
      </button>
    </div>

    <div class="flex items-end gap-2">
      <template v-if="onMedia">
        <input ref="fileRef" type="file" accept="image/*,video/*" class="hidden" @change="onFileChange" />
        <!-- Une pièce jointe ne remplace pas un texte : le bouton reste en
             place mais inerte, plutôt que de disparaître sous le curseur. -->
        <button
          class="btn btn-ghost h-[44px] px-3"
          @click="fileRef?.click()"
          :disabled="!!edit"
          aria-label="Joindre une photo ou une vidéo"
          :title="edit ? 'Modification en cours' : 'Joindre une photo ou une vidéo'"
        >
          <Icon name="paperclip" :size="18" />
        </button>
      </template>
      <textarea
        ref="areaRef"
        class="scroll input max-h-40 min-h-[44px] flex-1 resize-none py-3 leading-snug"
        :aria-label="placeholder"
        rows="1"
        :placeholder="placeholder"
        :value="text"
        maxlength="2000"
        @input="onInput"
        @select="syncPending($event.target as HTMLTextAreaElement)"
        @blur="pending = null"
        @paste="onPaste"
        @keydown="onKeyDown"
      />
      <button
        class="btn btn-primary h-[44px] px-4"
        @click="send"
        :disabled="!text.trim() && !pasted"
        :aria-label="edit ? 'Valider la modification' : 'Envoyer'"
      >
        <Icon :name="edit ? 'check' : 'send'" :size="17" />
      </button>
    </div>
  </div>
</template>
