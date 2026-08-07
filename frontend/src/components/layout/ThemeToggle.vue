<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '../ui';
import { useTheme } from './theme';

/* Bascule d'apparence. Volontairement discrète — c'est une préférence
   d'affichage, pas une action du service : elle ne doit concurrencer ni « Entrer »
   ni « Quitter ». L'icône montre la DESTINATION (une lune quand on est en clair),
   et le libellé accessible dit l'action, jamais l'état. */
const [theme, toggle] = useTheme();
const label = computed(() => (theme.value === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'));
</script>

<template>
  <button type="button" class="topbar__theme" :title="label" :aria-label="label" @click="toggle">
    <Icon :name="theme === 'dark' ? 'sun' : 'moon'" :size="17" />
  </button>
</template>
