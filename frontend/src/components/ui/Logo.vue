<script setup lang="ts">
// Marque Proxima. `className` porte la taille/mise en page (ex. « h-9 w-9 »).
// Version vectorielle (1,5 Ko) : nette de 32 à 64 px comme sur écran Retina, là
// où le PNG pleine résolution coûtait 300 Ko à chaque visite. L'étoile centrale
// est un évidement — elle laisse voir le fond et suit donc le thème.
// `frontend/public/logo.svg` est généré par `scripts/build-brand-assets.js`.
withDefaults(defineProps<{ className?: string }>(), { className: '' });
</script>

<template>
  <img src="/logo.svg" alt="Proxima" :class="`flex-none object-contain ${className}`" />
</template>
