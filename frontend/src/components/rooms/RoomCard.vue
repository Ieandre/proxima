<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue';
import { useStore } from '../../store/useStore';
import { joinRoom, leaveRoom } from '../../lib/socket';
import { Icon, Modal } from '../ui';
import Note from './Note.vue';
import type { RoomCardMode, RoomCardTarget } from './card';

/**
 * Fiche d'entrée / de sortie d'un salon.
 *
 * Elle ne s'ouvre plus que quand elle a quelque chose à DEMANDER ou à DÉTRUIRE.
 * Un salon en clair s'ouvre d'un clic sur sa ligne : le serveur n'annonce aucune
 * arrivée, et sortir se fait dans le même geste — il n'y avait donc rien à faire
 * confirmer, seulement une route à barrer.
 *
 * Restent ses deux cas porteurs :
 *  - ENTRER dans un salon chiffré, où le mot de passe est la condition de la clé
 *    (dérivée ici, jamais envoyée) ;
 *  - SORTIR, qui peut effacer le salon (RG-05), coûter la ressaisie du mot de
 *    passe, et — pour qui a pris la parole — s'annoncer aux présents.
 *
 * Elle sert les deux sens et les deux chemins (liste latérale `layout="inline"`,
 * lien `?r=` et menu du salon `layout="dialog"`), pour qu'un seul texte porte la
 * même promesse partout.
 *
 * Elle n'affiche JAMAIS qui est présent dans un salon où l'on n'est pas encore,
 * seulement combien : la discrétion est réciproque.
 */

const props = withDefaults(
  defineProps<{
    room: RoomCardTarget;
    mode: RoomCardMode;
    layout?: 'inline' | 'dialog';
    /** Mot de passe transporté par le fragment `#p=` d'un lien d'accès (jamais envoyé au serveur). */
    initialPassword?: string;
    onDone: () => void;
    onCancel: () => void;
  }>(),
  { layout: 'inline' },
);

const st = useStore();
// Un salon chiffré exige la dérivation locale de la clé : son sel public est donc
// la condition du champ de mot de passe (sans sel, rien à dériver).
const needsPassword = computed(() => props.mode === 'enter' && props.room.encrypted && !!props.room.salt);
// A-t-on pris la parole ici ? C'est ce qui décide si le départ sera annoncé aux
// présents (le serveur applique la même règle, cf. `announceLeave`). Lu dans le
// fil local plutôt que compté à part : un message à soi y est déjà marqué `me`,
// et le fil survit à une sortie — comme la mémoire qu'en garde le serveur.
const spoke = computed(() => (st.threads[`room:${props.room.id}`] || []).some((m) => m.kind === 'me'));

const password = ref(props.initialPassword || '');
const busy = ref(false);
const error = ref<string | null>(null);
const firstField = ref<HTMLInputElement | null>(null);
const confirm = ref<HTMLButtonElement | null>(null);
// Le cadre n'est un élément que dépliée en liste ; en dialogue, la racine est la
// modale (un composant) et le recadrage n'a pas d'objet — le ref reste alors nul.
const frame = ref<HTMLElement | null>(null);
const captureFrame = (el: Element | ComponentPublicInstance | null) => {
  frame.value = el instanceof HTMLElement ? el : null;
};

// Dépliée sous la dernière ligne d'une liste défilante, la fiche naîtrait hors de
// l'écran : on la ramène dans le champ de vision, sans plus de défilement que
// nécessaire (`nearest`), pour ne pas déplacer une liste déjà lisible.
onMounted(() => {
  frame.value?.scrollIntoView({ block: 'nearest' });
});

// Échap referme : la sortie doit être aussi immédiate que l'ouverture, sinon la
// fiche devient un piège plutôt qu'un temps d'arrêt.
const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onCancel();
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));

// Le clavier arrive directement sur l'action : saisir puis Entrée suffit.
const focusAction = () => (needsPassword.value ? firstField.value : confirm.value)?.focus();
onMounted(focusAction);
watch(needsPassword, focusAction, { flush: 'post' });

async function submit() {
  if (busy.value) return;
  if (props.mode === 'leave') {
    leaveRoom(props.room.id);
    props.onDone();
    return;
  }
  if (needsPassword.value && !password.value) return;
  busy.value = true;
  error.value = null;
  const res = await joinRoom(
    needsPassword.value
      ? { roomId: props.room.id, password: password.value, salt: props.room.salt }
      : { roomId: props.room.id },
  );
  busy.value = false;
  if (res.ok) props.onDone();
  else error.value = res.error || "L'entrée a échoué.";
}

const pseudo = computed(() => st.me?.pseudo || 'Vous');
// La nature dit ce QU'EST le salon. Le chiffrement n'en fait plus partie : tous le
// sont, et l'annoncer ici évincerait la seule information que la fiche donnait
// (région, privé, public). Il est dit plus bas, avec sa portée exacte.
const nature = computed(() =>
  props.room.region
    ? 'Salon de votre région'
    : props.room.locked
      ? 'Salon privé chiffré'
      : props.room.private
        ? 'Salon privé'
        : 'Salon public',
);

// La même fiche sous deux habits : la modale (avec son titre) pour le chemin du
// lien et le menu du salon, un simple cadre pour la liste latérale.
const wrapperProps = computed(() =>
  props.layout === 'dialog'
    ? {
        title: props.mode === 'leave' ? `Sortir de « ${props.room.name} »` : `Entrer dans « ${props.room.name} »`,
        onClose: props.onCancel,
      }
    : { class: 'room-card' },
);
</script>

<template>
  <component :is="layout === 'dialog' ? Modal : 'div'" v-bind="wrapperProps" :ref="captureFrame">
    <form @submit.prevent="submit">
      <!-- Pas de titre : dépliée, la fiche est collée sous la ligne qui porte déjà le nom
           et ses étiquettes ; en dialogue, c'est l'en-tête de la modale qui le porte.
           L'écrire une troisième fois ne ferait qu'éloigner la conséquence du bouton. -->
      <p class="room-card__meta">{{ nature }}{{ room.count ? ` · ${room.count} présent${room.count > 1 ? 's' : ''}` : '' }}</p>

      <input
        v-if="needsPassword"
        ref="firstField"
        class="input mt-3"
        type="password"
        placeholder="Mot de passe du salon"
        maxlength="64"
        v-model="password"
      />

      <div class="room-card__notes">
        <!-- Rien sur l'entrée : elle ne prévient personne, dans aucun salon. La
             présence se lit dans la liste des présents, une fois dedans. -->
        <template v-if="mode === 'leave'">
          <Note v-if="room.region || !spoke" icon="eye-off">Sortie discrète : personne ne sera prévenu·e.{{ room.region ? ' Vous pourrez revenir depuis cette liste.' : " Vous n'avez rien écrit ici." }}</Note>
          <Note v-else icon="info">
            En sortant, les présents verront
            <!-- Espaces insécables à l'intérieur des guillemets : la typographie française
                 les impose, et elles empêchent au passage le « de rester seul en fin de ligne. -->
            <span class="room-card__quote">«&nbsp;{{ pseudo }} est sorti·e du salon&nbsp;»</span>.
          </Note>
        </template>

        <Note v-if="needsPassword" icon="lock">Le mot de passe ne quitte pas votre appareil : la clé est dérivée ici.</Note>
        <Note v-if="mode === 'leave' && room.alone" icon="clock">Vous êtes seul·e ici : le salon disparaîtra en sortant.</Note>
        <!-- Ce que le chiffrement d'un salon PUBLIC protège, dit sans le survendre : il met
             le contenu hors de portée de l'hébergeur, et de personne d'autre — puisque
             entrer suffit pour recevoir la clé. -->
        <Note v-if="mode === 'enter' && room.encrypted && !room.locked" icon="lock">Chiffré de bout en bout : l’hébergeur ne peut pas lire ce salon. Toute personne qui y entre, en revanche, en reçoit la clé.</Note>
        <Note v-if="mode === 'leave' && room.locked" icon="key">Il faudra ressaisir le mot de passe pour revenir.</Note>
      </div>

      <p v-if="error" class="room-card__error">{{ error }}</p>

      <div class="room-card__actions">
        <button type="button" class="btn btn-ghost" @click="onCancel">Annuler</button>
        <button
          ref="confirm"
          type="submit"
          :class="`btn ${mode === 'leave' ? 'btn-danger' : 'btn-primary'}`"
          :disabled="busy || (needsPassword && !password)"
        >
          <template v-if="mode === 'leave'"><Icon name="logout" :size="15" />Sortir</template>
          <template v-else><Icon name="arrowRight" :size="15" />{{ busy ? 'Entrée…' : 'Entrer' }}</template>
        </button>
      </div>
    </form>
  </component>
</template>
