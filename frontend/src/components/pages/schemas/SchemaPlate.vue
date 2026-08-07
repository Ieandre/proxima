<script setup lang="ts">
import { useTemplateRef } from 'vue';
import { Icon } from '../../ui';
import { useReveal } from './motion';

/* ---- Cadre commun : une « planche » numérotée ------------------------- */

defineProps<{ n: number; title: string }>();

const plate = useTemplateRef<HTMLElement>('plate');
useReveal(plate);
</script>

<template>
  <figure ref="plate" class="reveal mt-6 overflow-hidden rounded-2xl border border-line bg-card">
    <div class="flex items-center gap-2 border-b border-line bg-paper-2 px-4 py-3">
      <span class="chip chip-blue"> <Icon name="hash" :size="11" /> Schéma {{ n }} </span>
      <span class="font-display text-[15px] font-semibold">{{ title }}</span>
    </div>
    <div class="schema-grid px-4 py-7 sm:px-6"><slot /></div>
    <figcaption class="border-t border-line px-4 py-2.5 text-[12px] leading-snug text-muted"><slot name="legend" /></figcaption>
  </figure>
</template>
