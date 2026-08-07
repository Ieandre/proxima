<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '../../ui';
import { accentOf, type Tone } from './tones';

/* La mention d'accès (`access` côté React) devient le slot par défaut. */
const props = defineProps<{ tone: Tone; icon: string; title: string; tag: string; meta: string }>();

const a = computed(() => accentOf(props.tone));
</script>

<template>
  <div class="rounded-xl border border-line bg-card p-4">
    <div class="mb-3 flex items-center gap-2.5">
      <span class="grid h-9 w-9 place-items-center rounded-lg" :style="{ color: a.color, background: a.bg }">
        <Icon :name="icon" :size="17" />
      </span>
      <div>
        <div class="font-display text-[14.5px] font-semibold leading-tight text-ink">{{ title }}</div>
        <div class="text-[10px] font-semibold" :style="{ color: a.color }">
          {{ tag }}
        </div>
      </div>
    </div>

    <!-- Membres figurés -->
    <div class="mb-3 flex items-center gap-1">
      <span
        v-for="(c, i) in ['--figure-1', '--figure-2', '--figure-3', '--figure-4']"
        :key="c"
        class="h-5 w-5 rounded-md"
        :style="{ background: `var(${c})`, opacity: 0.85 - i * 0.12 }"
      />
      <span class="ml-1 text-[10px] text-faint">+ participants</span>
    </div>

    <p class="text-[12.5px] leading-snug text-muted">{{ meta }}</p>
    <div class="mt-2.5 flex items-center gap-1.5 text-[10.5px] font-semibold" :style="{ color: a.color }">
      <slot />
    </div>
  </div>
</template>
