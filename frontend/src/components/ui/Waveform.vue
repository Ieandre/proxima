<script setup lang="ts">
import { computed } from 'vue';
import { WAVE_BARS } from '../../lib/voice';

/**
 * Silhouette d'un message vocal.
 *
 * Les hauteurs viennent du micro de l'émetteur et ont voyagé scellées dans
 * l'enveloppe (cf. `lib/voice.ts`) : ces barres sont exactement celles qu'il a
 * vues se tracer. Rien n'est décodé ici — le son n'est pas analysé à la
 * réception, il est seulement joué.
 *
 * La couleur est celle du contexte (`currentColor`) : rouge pendant la capture,
 * bleu une fois la prise devenue un objet, blanche dans une bulle à soi.
 */
const props = withDefaults(
  defineProps<{
    /** Hauteurs 0–255. Absente : une silhouette au repos, régulière et discrète. */
    peaks?: Uint8Array | number[] | null;
    /** Part déjà écoutée, de 0 à 1. */
    progress?: number;
    /** Capture en cours : la forme suit la voix au lieu de représenter un tout. */
    live?: boolean;
  }>(),
  { progress: 0, live: false },
);

/** Hauteur au repos, en pourcentage — assez basse pour ne pas se faire passer pour du son. */
const IDLE = 20;
/** Une barre muette reste visible : un silence dans une phrase est une information. */
const FLOOR = 9;

const heights = computed(() => {
  const raw = props.peaks?.length ? Array.from(props.peaks) : null;
  if (!raw) return new Array(WAVE_BARS).fill(`${IDLE}%`);
  // Pendant la capture, la forme se remplit par la DROITE : les premières
  // secondes n'occupent pas toute la largeur, sans quoi une prise d'une seconde
  // se dessinerait aussi large qu'une prise d'une minute.
  const vals = props.live && raw.length < WAVE_BARS ? [...new Array(WAVE_BARS - raw.length).fill(0), ...raw] : raw;
  return vals.map((v) => `${Math.max(FLOOR, Math.round((Math.min(255, Math.max(0, v)) / 255) * 100))}%`);
});

// Pendant la capture il n'y a rien à « avoir écouté » : la forme est pleine, et
// c'est le défilement qui dit qu'elle est vivante.
const filled = computed(() => `${props.live ? 100 : Math.min(100, Math.max(0, props.progress * 100))}%`);
</script>

<template>
  <div :class="`wave ${live ? 'wave--live' : ''}`" :style="{ '--wave-filled': filled }" aria-hidden="true">
    <div class="wave__layer">
      <i v-for="(h, i) in heights" :key="i" class="wave__bar" :style="{ height: h }" />
    </div>
    <div class="wave__layer wave__layer--filled">
      <i v-for="(h, i) in heights" :key="i" class="wave__bar" :style="{ height: h }" />
    </div>
  </div>
</template>
