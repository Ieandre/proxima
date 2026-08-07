<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '../../ui';
import { accentOf, type Tone } from './tones';

const props = defineProps<{ tone: Tone; name: string; sub: string; note: string }>();

const a = computed(() => accentOf(props.tone));
</script>

<template>
  <div class="flex-1 rounded-xl border border-line bg-card p-4 text-center sm:max-w-[176px]">
    <span class="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-xl" :style="{ color: a.color, background: a.bg }">
      <Icon name="key" :size="21" />
    </span>
    <div class="font-display text-[14.5px] font-semibold text-ink">{{ name }}</div>
    <div class="mt-0.5 text-[10px] font-semibold" :style="{ color: a.color }">
      {{ sub }}
    </div>
    <div class="mt-2 text-[12px] leading-snug text-muted">{{ note }}</div>
  </div>
</template>
