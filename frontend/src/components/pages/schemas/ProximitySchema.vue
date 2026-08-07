<script setup lang="ts">
import { usePrefersReducedMotion } from './motion';
import SchemaPlate from './SchemaPlate.vue';

/* =======================================================================
 * Schéma 2 — Périmètre de proximité (radar 75 km)
 * ===================================================================== */

/** Point sur le segment (ax,ay)→(bx,by) à distance d de (ax,ay). */
function pointOnSegment(ax: number, ay: number, bx: number, by: number, d: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  return { x: ax + (dx / len) * d, y: ay + (dy / len) * d };
}

const reduced = usePrefersReducedMotion();
// Centre du radar et rayons (104 = limite des 75 km).
const cx = 134;
const cy = 150;
const R = 104;
// Nancy : à l'intérieur du rayon. Marseille : au-delà.
const nancy = { x: 184, y: 112 };
const mars = { x: 286, y: 206 };
const edge = pointOnSegment(cx, cy, mars.x, mars.y, R); // intersection ligne/anneau
</script>

<template>
  <SchemaPlate :n="2" title="« Autour de vous », sans GPS">
    <template #legend>
      La ville que vous déclarez est convertie <strong class="font-semibold text-ink">hors-ligne</strong> en coordonnées
      approximatives. On vous relie aux villes situées dans un rayon d'environ&nbsp;75&nbsp;km — votre position exacte n'est jamais
      demandée.
    </template>

    <svg viewBox="0 0 460 300" class="mx-auto block h-auto w-full" :style="{ maxWidth: '460px' }" role="img" aria-label="Radar de proximité : Nancy à l'intérieur du rayon de 75 km, Marseille au-delà.">
      <!-- Croix de visée -->
      <line :x1="cx - 128" :y1="cy" :x2="cx + 128" :y2="cy" stroke="var(--color-line)" stroke-width="1" />
      <line :x1="cx" :y1="cy - 128" :x2="cx" :y2="cy + 128" stroke="var(--color-line)" stroke-width="1" />

      <!-- Anneaux concentriques -->
      <circle :cx="cx" :cy="cy" r="40" fill="none" stroke="var(--color-line)" stroke-width="1" />
      <circle :cx="cx" :cy="cy" r="72" fill="none" stroke="var(--color-line)" stroke-width="1" />
      <!-- Anneau « 75 km » : zone de portée -->
      <circle :cx="cx" :cy="cy" :r="R" fill="color-mix(in srgb, var(--color-blue) 5%, transparent)" stroke="var(--color-blue)" stroke-width="1.6" stroke-dasharray="2 4" />

      <!-- Ping radar (désactivé si mouvement réduit) -->
      <circle v-if="!reduced" :cx="cx" :cy="cy" r="16" fill="none" stroke="var(--color-blue)" stroke-width="1.4">
        <animate attributeName="r" values="14;104" dur="3.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0" dur="3.4s" repeatCount="indefinite" />
      </circle>

      <!-- Étiquette du rayon -->
      <text :x="cx" :y="cy - R - 9" text-anchor="middle" font-family="var(--font-sans)" font-size="11" letter-spacing="0.06em" fill="var(--color-blue)">
        RAYON ≈ 75 km
      </text>

      <!-- Liaison vers Nancy (à portée) -->
      <line :x1="cx" :y1="cy" :x2="nancy.x" :y2="nancy.y" stroke="var(--color-verified)" stroke-width="1.6" />
      <circle :cx="nancy.x" :cy="nancy.y" r="5.5" fill="var(--color-verified)" />
      <text :x="nancy.x + 11" :y="nancy.y - 4" font-family="var(--font-sans)" font-size="11.5" fill="var(--color-ink)">
        Nancy
      </text>
      <text :x="nancy.x + 11" :y="nancy.y + 10" font-family="var(--font-sans)" font-size="9.5" fill="var(--color-verified)">
        ~50 km · à portée
      </text>

      <!-- Liaison vers Marseille (coupée à l'anneau) -->
      <line :x1="cx" :y1="cy" :x2="edge.x" :y2="edge.y" stroke="var(--color-faint)" stroke-width="1.4" stroke-dasharray="3 4" opacity="0.7" />
      <g stroke="var(--color-danger)" stroke-width="1.6" stroke-linecap="round">
        <line :x1="edge.x - 4" :y1="edge.y - 4" :x2="edge.x + 4" :y2="edge.y + 4" />
        <line :x1="edge.x + 4" :y1="edge.y - 4" :x2="edge.x - 4" :y2="edge.y + 4" />
      </g>
      <circle :cx="mars.x" :cy="mars.y" r="5" fill="none" stroke="var(--color-faint)" stroke-width="1.6" />
      <text :x="mars.x + 11" :y="mars.y - 4" font-family="var(--font-sans)" font-size="11.5" fill="var(--color-muted)">
        Marseille
      </text>
      <text :x="mars.x + 11" :y="mars.y + 10" font-family="var(--font-sans)" font-size="9.5" fill="var(--color-faint)">
        ~600 km · hors zone
      </text>

      <!-- Vous, au centre -->
      <circle :cx="cx" :cy="cy" r="9" fill="var(--color-blue)" />
      <circle :cx="cx" :cy="cy" r="3" fill="var(--color-card)" />
      <text :x="cx" :y="cy + 26" text-anchor="middle" font-family="var(--font-sans)" font-size="10.5" letter-spacing="0.04em" fill="var(--color-blue)">
        VOUS · Metz
      </text>
    </svg>
  </SchemaPlate>
</template>
