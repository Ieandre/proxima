<script setup lang="ts">
import Flow from './Flow.vue';
import NodeBox from './NodeBox.vue';
import SchemaPlate from './SchemaPlate.vue';

/* =======================================================================
 * Schéma 1 — Cycle de vie éphémère d'une session
 * ===================================================================== */
</script>

<template>
  <SchemaPlate :n="1" title="Le cycle de vie d'une session">
    <template #legend>
      Tout vit en <strong class="font-semibold text-ink">mémoire vive</strong>. À la fermeture de l'onglet, la fiche et les
      conversations disparaissent&nbsp;: rien n'a jamais été écrit sur disque.
    </template>

    <div class="flex flex-col items-stretch gap-2 sm:flex-row">
      <NodeBox icon="info" tone="blue" kicker="01 · Entrée" title="Une fiche en RAM">
        Pseudo, âge et ville forment une fiche, créée en mémoire vive.
      </NodeBox>
      <Flow label="en RAM" tone="blue" />
      <NodeBox icon="clock" tone="blue" kicker="02 · Visite" title="Minuterie TTL">
        Prolongée en continu tant que votre onglet reste ouvert.
      </NodeBox>
      <Flow label="fermeture" />
      <NodeBox icon="close" tone="bad" kicker="03 · Sortie" title="Effacement">
        La minuterie expire&nbsp;: la fiche est détruite, sans trace.
      </NodeBox>
    </div>

    <!-- Sol : le disque, jamais sollicité. -->
    <div class="hatch mt-4 flex items-center gap-2.5 rounded-xl border border-dashed border-line-strong px-3.5 py-2.5">
      <span class="grid h-7 w-7 shrink-0 place-items-center text-danger">
        <!-- Glyphe local (hors jeu d'icônes partagé) -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <ellipse cx="12" cy="6" rx="7" ry="3" />
          <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
          <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
          <path d="M4 4l16 16" />
        </svg>
      </span>
      <span class="text-[11px] font-medium text-faint">
        Disque · stockage permanent — <span class="text-danger">aucune écriture</span>
      </span>
    </div>
  </SchemaPlate>
</template>
