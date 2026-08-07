<script setup lang="ts">
import { Icon } from '../../ui';
import RoomCard from './RoomCard.vue';
import SchemaPlate from './SchemaPlate.vue';

/* =======================================================================
 * Schéma 5 — Salons publics et privés
 * ===================================================================== */
</script>

<template>
  <SchemaPlate :n="5" title="Salons publics et privés">
    <template #legend>
      Trois portes, un seul régime&nbsp;: tous les salons sont
      <strong class="font-semibold text-ink">chiffrés de bout en bout</strong> — le serveur ne relaie que des
      enveloppes opaques, comme pour les&nbsp;MP. Ce qui change d'un type à l'autre, c'est la
      <strong class="font-semibold text-ink">porte</strong>, donc la façon d'obtenir la clé.
    </template>

    <div class="grid gap-3 sm:grid-cols-3">
      <RoomCard
        tone="blue"
        icon="globe"
        title="Salon public"
        tag="Chiffré · clé de groupe"
        meta="Listé pour tout le monde, rejoint librement. Quiconque entre reçoit la clé des membres."
      >
        <Icon name="users" :size="13" /> Accès ouvert
      </RoomCard>
      <RoomCard
        tone="neutral"
        icon="key"
        title="Privé sur invitation"
        tag="Chiffré · clé de groupe"
        meta="S'ouvre par lien d'invitation. La clé est remise par les membres à l'arrivée."
      >
        <!-- Glyphe local : le lien (hors jeu d'icônes partagé) -->
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9.5 14.5l5-5" />
          <path d="M8 11l-2 2a3 3 0 0 0 4.2 4.2l2-2" />
          <path d="M16 13l2-2a3 3 0 0 0-4.2-4.2l-2 2" />
        </svg>
        Lien d'invitation
      </RoomCard>
      <RoomCard
        tone="ok"
        icon="lock"
        title="Privé à mot de passe"
        tag="Chiffré · mot de passe"
        meta="Clé dérivée du mot de passe, que le serveur ne voit jamais."
      >
        <Icon name="lock" :size="13" /> Mot de passe
      </RoomCard>
    </div>

    <!-- Règle de propriété -->
    <div class="mt-3 flex flex-col gap-2 rounded-xl border border-line bg-paper-2 p-3 sm:flex-row sm:items-center">
      <span class="chip chip-blue shrink-0"> <Icon name="crown" :size="11" /> Propriété </span>
      <div class="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
        <span>Le créateur peut exclure ou fermer le salon.</span>
        <span class="text-faint">→</span>
        <span>S'il part, le plus ancien présent en hérite.</span>
        <span class="text-faint">→</span>
        <span class="text-danger">Un salon vide est supprimé aussitôt.</span>
      </div>
    </div>
  </SchemaPlate>
</template>
