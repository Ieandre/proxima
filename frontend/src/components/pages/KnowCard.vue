<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '../ui';

const props = defineProps<{ tone: 'ok' | 'bad'; title: string; items: string[] }>();

const isBad = computed(() => props.tone === 'bad');
</script>

<template>
  <div
    class="rounded-2xl border p-5"
    :style="{
      borderColor: isBad
        ? 'color-mix(in srgb, var(--color-danger) 22%, transparent)'
        : 'color-mix(in srgb, var(--color-verified) 22%, transparent)',
      background: isBad ? 'var(--color-danger-tint)' : 'var(--color-verified-tint)',
    }"
  >
    <div class="mb-3 flex items-center gap-2 font-semibold" :style="{ color: isBad ? 'var(--color-danger)' : 'var(--color-verified)' }">
      <Icon :name="isBad ? 'close' : 'check'" :size="16" />
      {{ title }}
    </div>
    <ul class="flex flex-col gap-2 text-[13.5px] text-ink">
      <li v-for="it in items" :key="it" class="flex gap-2">
        <span :style="{ color: isBad ? 'var(--color-danger)' : 'var(--color-verified)' }">•</span>
        {{ it }}
      </li>
    </ul>
  </div>
</template>
