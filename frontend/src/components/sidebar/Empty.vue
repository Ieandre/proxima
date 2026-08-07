<script setup lang="ts">
defineProps<{ text: string }>();
</script>

<template>
  <p class="mb-5 px-1 text-[13px] leading-snug text-faint">{{ text }}</p>
</template>
