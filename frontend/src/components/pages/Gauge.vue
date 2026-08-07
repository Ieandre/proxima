<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ value: number; max: number; unit: string; color: string }>();

const pct = computed(() => Math.min(100, Math.round((props.value / props.max) * 100)));
</script>

<template>
  <div>
    <div class="mb-1.5 text-lg font-semibold tabular-nums text-ink">
      {{ value }} <span class="text-[11px] font-normal text-muted">{{ unit }}</span>
    </div>
    <div class="h-2.5 w-full overflow-hidden rounded-full bg-line">
      <div class="h-full rounded-full transition-all duration-300" :style="{ width: `${pct}%`, background: color }" />
    </div>
  </div>
</template>
