<script setup lang="ts">
import { Icon } from '../ui';

defineProps<{ icon: string; title: string; text: string }>();
</script>

<template>
  <div class="rounded-xl border border-line bg-card p-4">
    <span class="mb-2 inline-flex text-blue">
      <Icon :name="icon" :size="19" />
    </span>
    <div class="font-display text-[15px] font-semibold text-ink">{{ title }}</div>
    <div class="mt-0.5 text-[13px] leading-snug text-muted">{{ text }}</div>
  </div>
</template>
