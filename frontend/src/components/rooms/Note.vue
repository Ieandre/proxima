<script setup lang="ts">
import { Icon } from '../ui';

/* Une conséquence par ligne, chacune avec son signe : la personne doit pouvoir en
   compter les effets d'un coup d'œil plutôt que lire un paragraphe.
   Exporté et partagé avec la fiche d'invitation (`InviteCard`) : les deux fiches
   énoncent le même genre de promesse, elles doivent le faire de la même façon. */
defineProps<{ icon: string }>();
</script>

<template>
  <p class="room-card__note">
    <span class="room-card__note-icon">
      <Icon :name="icon" :size="13" />
    </span>
    <span><slot /></span>
  </p>
</template>
