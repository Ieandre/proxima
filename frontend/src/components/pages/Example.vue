<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <div class="mt-5 rounded-xl border-l-2 border-blue bg-blue-tint/60 px-4 py-3.5">
    <div class="mb-1 text-[11.5px] font-semibold text-blue">{{ title }}</div>
    <p class="text-[14px] leading-relaxed text-ink"><slot /></p>
  </div>
</template>
