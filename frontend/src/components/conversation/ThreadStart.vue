<script setup lang="ts">
/* ---- Messages privés (chiffrés E2E) ----------------------------------- */

/* Début de fil : posé juste au-dessus du champ de saisie (la conversation est ancrée
   en bas), donc là où le regard se trouve déjà et où l'on va agir. */

defineProps<{ title: string }>();
</script>

<template>
  <div class="mb-1 max-w-md">
    <p class="text-[13.5px] font-semibold text-ink">{{ title }}</p>
    <p class="mt-1 text-[13px] leading-relaxed text-faint"><slot /></p>
  </div>
</template>
