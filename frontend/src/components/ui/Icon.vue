<script setup lang="ts">
import { computed } from 'vue';

/* ---- Icônes (SVG inline, trait courant) --------------------------------- */
/* Fragments SVG en chaînes brutes, injectés par `v-html` : c'est du DOM créé à
   l'exécution depuis des constantes du bundle, pas un script inline — la CSP
   stricte n'est pas concernée. */
const PATHS: Record<string, string> = {
  lock: '<rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />',
  users:
    '<path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" /><circle cx="9" cy="7" r="3.2" /><path d="M22 19v-1a4 4 0 0 0-3-3.8" /><path d="M16 4.2A3.2 3.2 0 0 1 16 11" />',
  radar:
    '<path d="M19.07 4.93A10 10 0 1 0 22 12" /><path d="M12 12 19 5" /><circle cx="12" cy="12" r="1.6" /><path d="M12 12a6 6 0 1 0 6 6" />',
  plus: '<path d="M12 5v14M5 12h14" />',
  send: '<path d="M4 12 21 3l-6 18-4-7-7-2Z" />',
  close: '<path d="M6 6l12 12M18 6 6 18" />',
  crown: '<path d="M3 8l4 5 5-8 5 8 4-5v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" />',
  kick: '<circle cx="9" cy="7" r="3.2" /><path d="M3 19v-1a4 4 0 0 1 4-4h4" /><path d="M15 9l6 6m0-6-6 6" />',
  key: '<circle cx="8" cy="8" r="4" /><path d="M11 11l9 9M16 16l2-2M19 19l2-2" />',
  back: '<path d="M19 12H5m6-7-7 7 7 7" />',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />',
  globe: '<circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" />',
  'shield-check': '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" /><path d="m9 12 2 2 4-4" />',
  pin: '<path d="M12 21s-7-4.5-7-10a7 7 0 0 1 14 0c0 5.5-7 10-7 10Z" /><circle cx="12" cy="11" r="2.5" />',
  clock: '<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />',
  check: '<path d="M5 12l4.5 4.5L19 7" />',
  /* Copier. Distinct du trombone, qui dit « pièce jointe » partout ailleurs :
     deux glyphes pour deux gestes, sinon le vocabulaire visuel se brouille. */
  copy:
    '<rect x="9" y="9" width="12" height="12" rx="2" /><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />',
  /* Ouvrir une conversation. Ni l'avion de papier (« envoyer ce message-ci, tout de
     suite ») ni le cadenas (« chiffré », partout ailleurs) : ce geste-là ouvre un
     fil, il lui faut son propre glyphe. */
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />',
  'eye-off':
    '<path d="M9.9 5A9.6 9.6 0 0 1 12 4.8c5 0 9 4 10 7.2a13 13 0 0 1-2.2 3.4M6.3 6.3C3.9 7.8 2.4 10 1.9 12c1 3.2 5 7.2 10 7.2a9.4 9.4 0 0 0 5.6-1.8" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="m4 4 16 16" />',
  arrowRight: '<path d="M5 12h14m-6-6 6 6-6 6" />',
  info: '<circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.5h.01" />',
  paperclip:
    '<path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L10 17.4a1.7 1.7 0 0 1-2.3-2.3l7.8-7.8" />',
  /* Voix. La capsule sur pied dit « micro » sans passer par le micro de scène,
     dont la grille ne se lit plus à 18 px. */
  mic: '<rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" />',
  /* Lecture / pause / arrêt. Pleins, contrairement au reste du jeu qui est au
     trait : ce sont des commandes de transport, on les vise plus qu'on ne les lit. */
  play: '<path d="M8 5.2v13.6L19 12 8 5.2Z" fill="currentColor" stroke-linejoin="round" />',
  pause: '<path d="M9.5 5v14M14.5 5v14" stroke-width="2.6" />',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor" />',
  filter: '<path d="M3 5h18l-7 8v6l-4-2v-4L3 5Z" />',
  logout:
    '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 12H3m4-4-4 4 4 4" />',
  search: '<circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />',
  dots: '<circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" />',
  pencil: '<path d="M4 20h4L19 9a2.6 2.6 0 0 0-3.7-3.7L4 16.4V20Z" /><path d="m14.5 6.8 2.7 2.7" />',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4" /><circle cx="8.5" cy="8.5" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="15.5" cy="15.5" r="1.2" />',
  sun: '<circle cx="12" cy="12" r="4.2" /><path d="M12 2.4v2.2M12 19.4v2.2M4.2 12H2M22 12h-2.2M6.5 6.5 4.9 4.9M19.1 19.1l-1.6-1.6M17.5 6.5l1.6-1.6M4.9 19.1l1.6-1.6" />',
  moon: '<path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" />',
  bell: '<path d="M18 9.5a6 6 0 0 0-12 0c0 4.5-2 6-2 6h16s-2-1.5-2-6Z" /><path d="M10.3 19.2a2.2 2.2 0 0 0 3.4 0" />',
  'bell-off':
    '<path d="M18 9.5a6 6 0 0 0-12 0c0 4.5-2 6-2 6h16s-2-1.5-2-6Z" /><path d="M10.3 19.2a2.2 2.2 0 0 0 3.4 0" /><path d="M4 3.6 20 20.4" />',
};

const props = withDefaults(defineProps<{ name: keyof typeof PATHS | string; size?: number }>(), { size: 18 });

const markup = computed(() => PATHS[props.name] ?? '');
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="markup"
  />
</template>
