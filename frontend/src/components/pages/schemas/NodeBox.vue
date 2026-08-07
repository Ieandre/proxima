<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '../../ui';
import { accentOf, type Tone } from './tones';

const props = withDefaults(
  defineProps<{
    icon: string;
    kicker: string;
    title: string;
    tone?: Tone;
    dashed?: boolean;
  }>(),
  { tone: 'neutral', dashed: false },
);

const a = computed(() => accentOf(props.tone));
</script>

<template>
  <div :class="`flex-1 rounded-xl border bg-card p-3.5 ${dashed ? 'border-dashed border-line-strong' : 'border-line'}`">
    <div class="mb-2 flex items-center gap-2">
      <span class="grid h-8 w-8 place-items-center rounded-lg" :style="{ color: a.color, background: a.bg }">
        <Icon :name="icon" :size="16" />
      </span>
      <span class="text-[10px] font-semibold" :style="{ color: a.color }">
        {{ kicker }}
      </span>
    </div>
    <div class="font-display text-[14px] font-semibold leading-tight text-ink">{{ title }}</div>
    <p class="mt-1 text-[12.5px] leading-snug text-muted"><slot /></p>
  </div>
</template>
