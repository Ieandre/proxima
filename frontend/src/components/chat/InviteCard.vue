<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useStore } from '../../store/useStore';
import { acceptInvite, revokeInvite } from '../../lib/socket';
import { inviteUrl } from '../../lib/links';
import { Avatar, Icon } from '../ui';
import Note from '../rooms/Note.vue';

/**
 * Fiche d'invitation à une conversation privée. Dépliée sous son bouton dans la
 * barre latérale, même mécanique que `RoomCard` : ancrée dans un conteneur
 * défilant, elle ne peut ni se détacher ni être rognée.
 *
 * Les deux temps du rendez-vous tiennent dans un seul cadre — le lien à donner,
 * puis la personne qui l'a ouvert — parce que c'est une seule attente. Un
 * dialogue surgissant à l'arrivée ferait sursauter l'écran au moment précis où
 * l'on doit lire un pseudo avant de décider.
 *
 * La paire de nœuds en tête affiche l'état du rendez-vous (place tenue, place
 * vide qui respire, place occupée) : c'est le seul endroit du produit où
 * l'attente doit se lire sans phrase.
 */
const st = useStore();
const { invite, awaitingInvite: awaiting, me } = storeToRefs(st);

const copied = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const frame = ref<HTMLDivElement | null>(null);

// Dépliée en bas d'une liste défilante, la fiche naîtrait hors de l'écran. Le
// composant reste monté en permanence (il ne rend rien sans rendez-vous en
// cours) : c'est donc l'apparition de la fiche qu'on suit, pas le montage.
watch(
  [() => invite.value?.token, () => awaiting.value?.pseudo],
  () => {
    frame.value?.scrollIntoView({ block: 'nearest' });
  },
  { flush: 'post' }
);

// Le retour de la copie s'efface de lui-même : c'est un accusé, pas un état.
let copiedTimer: ReturnType<typeof setTimeout> | undefined;
watch(copied, (v) => {
  if (copiedTimer !== undefined) {
    clearTimeout(copiedTimer);
    copiedTimer = undefined;
  }
  if (!v) return;
  copiedTimer = setTimeout(() => (copied.value = false), 2200);
});
onUnmounted(() => {
  if (copiedTimer !== undefined) clearTimeout(copiedTimer);
});

const url = computed(() => (invite.value ? inviteUrl(invite.value.token) : ''));
const guest = computed(() => invite.value?.guest ?? null);

async function copy() {
  try {
    await navigator.clipboard.writeText(url.value);
    copied.value = true;
  } catch {
    // Presse-papiers refusé (contexte non sécurisé, permission) : l'adresse
    // reste sélectionnable à l'écran, on le dit plutôt que d'échouer en silence.
    st.showToast('Copie impossible — sélectionnez l’adresse pour la copier.', 'warn');
  }
}

/** Retire le lien. Gardé ici : le `v-else-if` du template garantit l'invitation, TS non. */
function revoke() {
  if (invite.value) revokeInvite(invite.value.token);
}

async function open() {
  if (busy.value || !invite.value) return;
  busy.value = true;
  error.value = null;
  const res = await acceptInvite(invite.value.token);
  busy.value = false;
  if (!res.ok) error.value = res.error || "L'ouverture a échoué.";
}
</script>

<template>
  <!-- Versant invité : on s'est présenté, la main est à l'autre. Même cadre et même
       paire de nœuds que côté hôte — c'est le même rendez-vous, vu de l'autre bout. -->
  <div v-if="me && !invite && awaiting" class="invite-card" ref="frame">
    <div class="invite-pair" aria-hidden="true">
      <Avatar :id="me.id" :pseudo="me.pseudo" :size="30" />
      <span class="invite-pair__wire" />
      <span class="invite-pair__empty" />
    </div>
    <p class="invite-card__lede" role="status">
      En attente de <strong>{{ awaiting.pseudo }}</strong>, qui doit confirmer l'ouverture.
    </p>
    <div class="room-card__notes">
      <Note icon="info">
        {{ awaiting.pseudo }} vérifie qu'il s'agit bien de vous, sur le canal où le lien vous a été envoyé.
      </Note>
    </div>
  </div>

  <div v-else-if="me && invite" class="invite-card" ref="frame">
    <!-- ---- État du rendez-vous : deux places, un lien ------------------ -->
    <div class="invite-pair" aria-hidden="true">
      <Avatar :id="me.id" :pseudo="me.pseudo" :size="30" />
      <span :class="`invite-pair__wire${guest ? ' invite-pair__wire--live' : ''}`" />
      <Avatar v-if="guest" :id="guest.id" :pseudo="guest.pseudo" :size="30" />
      <span v-else class="invite-pair__empty" />
    </div>

    <template v-if="guest">
      <p class="invite-card__lede" role="status">
        <strong>{{ guest.pseudo }}</strong> a ouvert votre lien.
      </p>
      <div class="room-card__notes">
        <Note icon="info">
          Vérifiez sur le canal où vous avez envoyé le lien qu'il s'agit bien de la bonne personne.
        </Note>
        <Note icon="lock">En ouvrant, vous échangez vos clés de chiffrement — rien d'autre.</Note>
      </div>

      <p v-if="error" class="room-card__error">{{ error }}</p>

      <div class="room-card__actions">
        <button type="button" class="btn btn-ghost" @click="revoke" :disabled="busy">
          Refuser
        </button>
        <button type="button" class="btn btn-primary" @click="open" :disabled="busy">
          <Icon name="arrowRight" :size="15" />
          {{ busy ? 'Ouverture…' : 'Ouvrir' }}
        </button>
      </div>
    </template>
    <template v-else>
      <p class="invite-card__lede">Envoyez cette adresse à la personne de votre choix.</p>

      <!-- Une adresse est une donnée, pas une phrase : elle est en chasse fixe,
           sélectionnable, et se lit caractère par caractère. -->
      <div class="invite-url">
        <span class="invite-url__text">{{ url }}</span>
        <button type="button" class="invite-url__copy" @click="copy">
          <Icon :name="copied ? 'check' : 'copy'" :size="14" />
          {{ copied ? 'Copié' : 'Copier' }}
        </button>
      </div>

      <div class="room-card__notes">
        <Note icon="users">La première personne qui ouvre ce lien prend la place.</Note>
        <Note icon="check">Vous confirmerez avant que la conversation s'ouvre.</Note>
        <Note icon="clock">Le lien ne vit que tant que cet onglet reste ouvert.</Note>
      </div>

      <div class="room-card__actions">
        <button type="button" class="btn btn-ghost" @click="revoke">
          Retirer le lien
        </button>
      </div>
    </template>
  </div>
</template>
