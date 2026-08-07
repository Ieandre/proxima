<script setup lang="ts">
import { computed } from 'vue';

/** Connecteur fléché : horizontal sur desktop, vertical (empilé) sur mobile. */
const props = withDefaults(
  defineProps<{ label?: string; dir?: 'right' | 'left'; tone?: 'neutral' | 'blue' }>(),
  { dir: 'right', tone: 'neutral' },
);

const stroke = computed(() => (props.tone === 'blue' ? 'var(--color-blue)' : 'var(--color-line-strong)'));
const rot = computed(() => (props.dir === 'left' ? '-rotate-90 sm:rotate-180' : 'rotate-90 sm:rotate-0'));
</script>

<template>
  <div class="flex shrink-0 flex-col items-center justify-center gap-1 self-center py-0.5">
    <svg :class="rot" width="38" height="20" viewBox="0 0 38 20" fill="none" aria-hidden="true">
      <line x1="3" y1="10" x2="30" y2="10" :stroke="stroke" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="4 5" class="dash-flow" />
      <path d="M27 5l7 5-7 5" :stroke="stroke" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span v-if="label" class="text-[10px] font-medium text-faint">{{ label }}</span>
  </div>
</template>
