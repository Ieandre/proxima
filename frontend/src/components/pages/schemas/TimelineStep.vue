<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '../../ui';
import { accentOf, type Tone } from './tones';

/* Le corps arrive en chaîne HTML statique (constantes du bundle, cf. Icon.vue) :
   `v-html` remplace ici les nœuds JSX du composant d'origine. */
const props = defineProps<{ icon: string; tone: Tone; title: string; last: boolean; body: string }>();

const a = computed(() => accentOf(props.tone));
</script>

<template>
  <li class="flex gap-3.5">
    <!-- Rail vertical avec pastille -->
    <div class="flex flex-col items-center">
      <span class="grid h-9 w-9 shrink-0 place-items-center rounded-full" :style="{ color: a.color, background: a.bg }">
        <Icon :name="icon" :size="16" />
      </span>
      <span v-if="!last" class="my-1 w-px flex-1" :style="{ background: 'var(--color-line-strong)' }" />
    </div>
    <!-- Contenu -->
    <div :class="last ? '' : 'pb-5'">
      <div class="font-display text-[14px] font-semibold leading-tight text-ink">{{ title }}</div>
      <p class="mt-1 text-[12.5px] leading-snug text-muted" v-html="body" />
    </div>
  </li>
</template>
