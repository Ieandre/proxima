<script setup lang="ts">
/* Deux informations distinctes dans une même pastille : combien de messages, et
   s'il y en a un qui vous nomme. Le « @ » et la teinte violette suffisent à faire
   remonter le salon dans l'attention sans ajouter un second marqueur à côté. */

defineProps<{ n: number; mention?: boolean }>();
</script>

<template>
  <span
    v-if="n"
    class="grid h-5 min-w-[20px] flex-none place-items-center rounded-full px-1.5 text-[10px] tabular-nums font-semibold text-white"
    :style="{ background: mention ? 'var(--color-accent)' : 'var(--color-blue)' }"
    :title="mention ? 'On vous a mentionné·e' : undefined"
  >{{ mention ? '@' : '' }}{{ n > 9 ? '9+' : n }}</span>
</template>
