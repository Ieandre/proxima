<script setup lang="ts">
import Flow from './Flow.vue';
import KeyCard from './KeyCard.vue';
import SchemaPlate from './SchemaPlate.vue';

/* =======================================================================
 * Schéma 3 — Clé publique / clé privée
 * ===================================================================== */
</script>

<template>
  <SchemaPlate :n="3" title="Une clé ferme, l'autre ouvre">
    <template #legend>
      La clé publique <strong class="font-semibold text-ink">verrouille</strong> mais ne déverrouille pas. Seule la clé privée —
      qui ne quitte jamais votre navigateur — ouvre le coffre.
    </template>

    <div class="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
      <KeyCard tone="neutral" name="Clé publique" sub="publiée · partagée" note="ne sait que verrouiller" />
      <Flow label="ferme" dir="right" />
      <!-- Glyphe local : le coffre (hors jeu d'icônes partagé) -->
      <div class="flex shrink-0 flex-col items-center gap-1.5 self-center">
        <svg width="76" height="76" viewBox="0 0 76 76" fill="none" aria-hidden="true">
          <path d="M28 28v-5a10 10 0 0 1 20 0v5" stroke="var(--color-blue)" stroke-width="2.2" stroke-linecap="round" />
          <rect x="19" y="28" width="38" height="34" rx="6" fill="var(--color-blue-tint)" stroke="var(--color-blue)" stroke-width="2" />
          <circle cx="38" cy="42" r="4.2" fill="var(--color-blue)" />
          <path d="M38 46v7" stroke="var(--color-blue)" stroke-width="2.6" stroke-linecap="round" />
        </svg>
        <span class="text-[10px] font-semibold text-blue">Coffre</span>
      </div>
      <Flow label="ouvre" dir="left" tone="blue" />
      <KeyCard tone="blue" name="Clé privée" sub="jamais transmise" note="seule à déverrouiller" />
    </div>

    <div class="mt-5 flex flex-wrap justify-center gap-1.5">
      <span class="chip"> X25519 · échange de clés </span>
      <span class="chip"> XSalsa20-Poly1305 · chiffrement authentifié </span>
    </div>
  </SchemaPlate>
</template>
