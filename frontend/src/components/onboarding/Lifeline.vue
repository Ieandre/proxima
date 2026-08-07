<script setup lang="ts">
/* `what` est du HTML statique écrit par l'appelant (portage des fragments JSX :
   le contenu vient du bundle, jamais d'une saisie — `v-html` est sûr ici). */
defineProps<{ items: { when: string; what: string }[] }>();

/* -------------------------------------------------------------------------- */
/* Réseau vivant — nœuds reliés qui dérivent en fond, à peine visibles (le      */
/* texte de la page doit toujours gagner). Le curseur les attire, les allume et  */
/* tisse des liens vers eux : « les gens se rassemblent autour de vous ».        */
/*                                                                              */
/* Trois forces tiennent l'attroupement lisible : un cœur qui repousse (on se    */
/* rassemble autour de vous, pas dessus), une distance personnelle entre nœuds   */
/* (une foule, pas un pâté) et un ressort de rappel vers le point d'attache      */
/* (chacun repart chez lui — sinon le curseur finit par ramasser toute la        */
/* population en un seul tas). Canvas 2D.                                        */
/* -------------------------------------------------------------------------- */
// Exporté pour être réutilisé en fond de l'écran d'accueil (Conversation/EmptyState).
</script>

<template>
  <ol class="lifeline">
    <li
      v-for="(it, i) in items"
      :key="it.when"
      class="fade-up"
      :style="{ animationDelay: `${230 + i * 70}ms` }"
    >
      <span class="lifeline__when">{{ it.when }}</span>
      <p class="lifeline__what" v-html="it.what" />
    </li>
  </ol>
</template>
