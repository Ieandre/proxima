<script setup lang="ts">
import { computed, ref } from 'vue';
import { previewChime, setSoundMuted, soundMuted } from '../../lib/sound';
import { Icon } from '../ui';

// Bascule du son des notifications
const muted = ref(soundMuted());
const label = computed(() =>
  muted.value ? 'Rétablir le son des notifications' : 'Couper le son des notifications',
);

function toggle() {
  const next = !muted.value;
  setSoundMuted(next);
  muted.value = next;
  // Rétablir le son le fait entendre : sans cela il faudrait attendre un
  // message pour savoir ce qu'on vient de régler.
  if (!next) previewChime();
}
</script>

<template>
  <button type="button" class="topbar__theme" :title="label" :aria-label="label" @click="toggle">
    <Icon :name="muted ? 'bell-off' : 'bell'" :size="17" />
  </button>
</template>
