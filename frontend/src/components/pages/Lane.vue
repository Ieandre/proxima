<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '../ui';

const props = defineProps<{ label: string; icon: string; tone: 'neutral' | 'ok' | 'bad' }>();

const color = computed(() =>
  props.tone === 'ok' ? 'var(--color-verified)' : props.tone === 'bad' ? 'var(--color-danger)' : 'var(--color-faint)',
);
</script>

<template>
  <div class="rounded-xl border border-line bg-paper-2 p-3">
    <div class="mb-2 flex items-center gap-1.5 text-[11px] font-semibold" :style="{ color }">
      <Icon :name="icon" :size="12" />
      {{ label }}
    </div>
    <slot />
  </div>
</template>
