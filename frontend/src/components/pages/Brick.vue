<script setup lang="ts">
defineProps<{ term: string }>();
</script>

<template>
  <li class="flex flex-col gap-1 rounded-xl border border-line bg-card p-3.5 sm:flex-row sm:items-baseline sm:gap-3">
    <code class="shrink-0 font-mono text-[12.5px] font-semibold text-blue">{{ term }}</code>
    <span class="text-[13.5px] leading-snug text-muted"><slot /></span>
  </li>
</template>
