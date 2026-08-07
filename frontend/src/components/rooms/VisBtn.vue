<script setup lang="ts">
import { Icon } from '../ui';

defineProps<{
  active: boolean;
  icon: string;
  label: string;
  desc: string;
  onClick: () => void;
}>();
</script>

<template>
  <button
    type="button"
    class="rounded-xl border p-3 text-left transition-colors"
    :style="{
      borderColor: active ? 'var(--color-blue)' : 'var(--color-line-strong)',
      background: active ? 'var(--color-blue-tint)' : 'var(--color-card)',
    }"
    @click="onClick"
  >
    <span class="flex items-center gap-2 font-semibold" :style="{ color: active ? 'var(--color-blue)' : 'var(--color-ink)' }">
      <Icon :name="icon" :size="15" />{{ label }}
    </span>
    <span class="mt-0.5 block text-[12px] text-muted">{{ desc }}</span>
  </button>
</template>
