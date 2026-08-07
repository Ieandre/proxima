<script setup lang="ts">
import SchemaPlate from './SchemaPlate.vue';
import TimelineStep from './TimelineStep.vue';
import type { Tone } from './tones';

/* =======================================================================
 * Schéma 4 — Le déroulement, étape par étape
 * ===================================================================== */

const CIPHER_STEPS: { icon: string; tone: Tone; title: string; body: string }[] = [
  {
    icon: 'key',
    tone: 'blue',
    title: '1 · Génération des clés',
    body: `À l'ouverture de la session, votre navigateur fabrique une <strong class="text-ink">paire de clés</strong> liées entre elles&nbsp;: une publique, une privée.`,
  },
  {
    icon: 'send',
    tone: 'neutral',
    title: '2 · Publication de la clé publique',
    body: `La <strong class="text-ink">clé publique</strong> part vers le serveur pour qu'on puisse vous écrire. La <strong class="text-ink">clé privée</strong>, elle, ne quitte jamais l'appareil.`,
  },
  {
    icon: 'lock',
    tone: 'blue',
    title: '3 · Verrouillage',
    body: `Pour vous écrire, l'appareil d'en face combine <strong class="text-ink">sa clé privée</strong> et <strong class="text-ink">votre clé publique</strong>&nbsp;: il en tire un secret commun qui brouille et scelle le message.`,
  },
  {
    icon: 'radar',
    tone: 'bad',
    title: '4 · Relais aveugle',
    body: `Le serveur transmet le bloc chiffré au bon destinataire — <strong class="text-ink">sans jamais pouvoir l'ouvrir</strong>.`,
  },
  {
    icon: 'shield-check',
    tone: 'ok',
    title: '5 · Ouverture',
    body: `Votre appareil recalcule <strong class="text-ink">le même secret commun</strong> (votre clé privée + sa clé publique) et rétablit le message. Si un seul octet a été modifié en route, l'ouverture <strong class="text-ink">échoue</strong>.`,
  },
];
</script>

<template>
  <SchemaPlate :n="4" title="Le déroulement, étape par étape">
    <template #legend>
      Cinq étapes, deux appareils, un <strong class="font-semibold text-ink">secret commun</strong> qui n'est
      jamais transmis. Au milieu, le serveur ne voit passer qu'un bloc opaque.
    </template>

    <ol class="flex flex-col">
      <TimelineStep
        v-for="(s, i) in CIPHER_STEPS"
        :key="s.title"
        :icon="s.icon"
        :tone="s.tone"
        :title="s.title"
        :last="i === CIPHER_STEPS.length - 1"
        :body="s.body"
      />
    </ol>
  </SchemaPlate>
</template>
