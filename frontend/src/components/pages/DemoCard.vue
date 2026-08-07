<script setup lang="ts">
import { Icon } from '../ui';

defineProps<{ title: string; subtitle: string }>();
</script>

<template>
  <div class="mt-6 overflow-hidden rounded-2xl border border-line bg-card">
    <div class="border-b border-line bg-paper-2 px-4 py-3">
      <div class="flex items-center gap-2">
        <span class="chip chip-blue">
          <Icon name="radar" :size="11" /> Essayez vous-même
        </span>
        <span class="font-display text-[15px] font-semibold">{{ title }}</span>
      </div>
      <p class="mt-1 text-[12.5px] text-muted">{{ subtitle }}</p>
    </div>
    <div class="p-4"><slot /></div>
  </div>
</template>
