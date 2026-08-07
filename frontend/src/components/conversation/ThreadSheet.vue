<script setup lang="ts">
/* ---- Surface de lecture du fil ----------------------------------------- */

/**
 * Enveloppe les trois éléments qui doivent partager le même axe de lecture :
 * messages, indicateur de saisie, champ de saisie. Les borner séparément les
 * ferait dériver l'un par rapport à l'autre — un champ pleine largeur sous un fil
 * centré se lit comme un bug de rendu. La largeur et la surface sont dans
 * `.thread-sheet` (index.css), et ne s'activent qu'au-delà de 96rem.
 *
 * `min-w-0` : sans plancher à zéro, un contenu insécable (une URL collée dans un
 * message) élargirait la piste de grille parente, donc la page — même raison
 * qu'en amont dans `Chat.tsx`.
 */
</script>

<template>
  <div class="thread-sheet flex min-h-0 min-w-0 flex-1 flex-col"><slot /></div>
</template>
