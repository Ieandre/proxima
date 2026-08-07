<script setup lang="ts">
defineProps<{ eyebrow: string; title: string }>();
</script>

<template>
  <section class="border-b border-line py-10">
    <p class="mb-2 text-[13px] font-semibold text-blue">{{ eyebrow }}</p>
    <h2 class="font-display text-[clamp(1.4rem,3vw,2rem)] font-semibold tracking-tight" style="text-wrap: balance">
      {{ title }}
    </h2>
    <div class="mt-4 text-[15px] leading-relaxed text-muted [&_strong]:font-semibold"><slot /></div>
  </section>
</template>
