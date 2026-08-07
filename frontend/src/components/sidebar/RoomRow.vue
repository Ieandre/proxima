<script setup lang="ts">
import { computed } from 'vue';
import { type RoomEntry } from '../../lib/rooms';
import { Icon } from '../ui';
import UnreadBadge from './UnreadBadge.vue';

const props = defineProps<{
  room: RoomEntry;
  open: boolean;
  peeking: boolean;
  /** Entrée en cours : la ligne est le seul endroit où l'attente peut se voir. */
  joining?: boolean;
  unread: number;
  mention?: boolean;
  onEnter: () => void;
  onLeave: () => void;
}>();

// Le cadenas dit « fermé », pas « chiffré » : tout l'est désormais, et un cadenas
// partout ne distinguerait plus rien.
const icon = computed(() => (props.room.region ? 'pin' : props.room.locked || props.room.private ? 'lock' : 'hash'));
const meta = computed(() =>
  [
    props.room.count === null
      ? "vous n'y êtes plus"
      : props.room.count === 0
        ? 'vide'
        : `${props.room.count} présent${props.room.count > 1 ? 's' : ''}`,
    !props.room.here && props.room.locked ? 'mot de passe' : null,
  ]
    .filter(Boolean)
    .join(' · '),
);
</script>

<template>
  <div
    :class="`room-row${room.here ? ' room-row--here' : ''}${open ? ' room-row--open' : ''}${
      peeking ? ' room-row--peeking' : ''
    }`"
  >
    <!-- Un salon verrouillé est le seul dont le clic n'entre pas tout de suite : il
         demande le mot de passe dont la clé se dérive. Ailleurs, la ligne ouvre. -->
    <button
      class="room-row__main"
      :disabled="joining"
      :title="
        room.here
          ? `Ouvrir ${room.name}`
          : room.locked
            ? `Entrer dans ${room.name} (mot de passe)`
            : `Entrer dans ${room.name}`
      "
      @click="onEnter"
    >
      <span class="room-row__tile">
        <Icon :name="icon" :size="15" />
      </span>
      <span class="room-row__body">
        <span class="room-row__title">
          <span class="truncate">{{ room.name }}</span>
          <span v-if="room.region" class="room-tag room-tag--region">Votre région</span>
          <span v-if="room.official && !room.region" class="room-tag">permanent</span>
        </span>
        <span class="room-row__meta">{{ meta }}</span>
      </span>
      <UnreadBadge :n="unread" :mention="mention" />
    </button>

    <!-- Ouvrir un salon où l'on est doit rester un clic sur la ligne : la sortie est
         donc une commande à part, discrète, révélée au survol (toujours visible au
         doigt — un survol n'existe pas, et une action invisible non plus). L'icône
         dit le geste lui-même : une porte de sortie, pas un menu qui n'existe pas. -->
    <span class="room-row__aside">
      <!-- Toujours visible, contrairement au chevron : c'est le seul signe que le
           clic a été pris pendant que l'accusé du serveur se fait attendre. -->
      <span v-if="joining" class="room-row__go room-row__go--busy spin" role="status" aria-label="Entrée en cours">
        <Icon name="clock" :size="15" />
      </span>
      <button
        v-else-if="room.here"
        class="room-row__leave"
        :aria-label="`Sortir de ${room.name}`"
        title="Sortir du salon"
        @click="onLeave"
      >
        <Icon name="logout" :size="15" />
      </button>
      <span v-else class="room-row__go" aria-hidden="true">
        <Icon name="arrowRight" :size="15" />
      </span>
    </span>
  </div>
</template>
