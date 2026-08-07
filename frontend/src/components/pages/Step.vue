<script setup lang="ts">
defineProps<{ n: string; title: string }>();
</script>

<template>
  <li class="flex gap-4 rounded-xl border border-line bg-card p-4">
    <span class="font-display text-2xl font-semibold leading-none text-blue/70 tabular-nums">{{ n }}</span>
    <div>
      <div class="font-semibold text-ink">{{ title }}</div>
      <p class="mt-0.5 text-[13.5px] leading-snug text-muted"><slot /></p>
    </div>
  </li>
</template>
