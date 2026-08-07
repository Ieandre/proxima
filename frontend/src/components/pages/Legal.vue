<script setup lang="ts">
import { computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { closePage } from '../../lib/router';
import { useStore } from '../../store/useStore';
import SiteFooter from '../layout/SiteFooter.vue';
import TopBar from '../layout/TopBar.vue';
import { Icon, Logo } from '../ui';
import { TABS } from './legal-tabs';
import CGU from './CGU.vue';
import Confidentialite from './Confidentialite.vue';
import Moderation from './Moderation.vue';
import Mentions from './Mentions.vue';

/* ==========================================================================
 * Pages juridiques dédiées (UE / France) : CGU, Politique de
 * confidentialité (RGPD), Politique de modération (DSA), Mentions légales.
 *
 * Socle conforme au cadre DSA (Règlement UE 2022/2065) et RGPD. L'ensemble
 * doit être validé par un conseil juridique avant production — réserve
 * interne, qui n'est plus affichée aux visiteurs (un bandeau annonçant une
 * validation à venir n'a pas sa place sur un site déjà en ligne).
 * Le point de contact est injecté depuis /api/legal (CONTACT_EMAIL).
 * ======================================================================== */

const props = defineProps<{ path: string }>();

// Chargé une seule fois par `App.vue` et distribué par le store (cf. About.vue).
const { legal } = storeToRefs(useStore());

watch(
  () => props.path,
  () => {
    window.scrollTo(0, 0);
  },
  { immediate: true, flush: 'post' },
);

const contact = computed(() => legal.value?.contactEmail || '');
const updated = computed(() => legal.value?.lastUpdated || '2026-08-03');
</script>

<template>
  <div class="min-h-full">
    <TopBar column="text" :onHome="closePage">
      <button class="btn btn-ghost px-3" @click="closePage">
        <Icon name="back" :size="16" /> Retour
      </button>
    </TopBar>

    <!-- Le `pb-24` vit sur l'article, pas sur le conteneur : sinon le pied de page
        flotterait au-dessus de 6 rem de vide. -->
    <article class="mx-auto max-w-3xl px-5 pb-24">
      <!-- Navigation entre documents -->
      <nav class="flex flex-wrap gap-2 border-b border-line py-5">
        <a
          v-for="t in TABS"
          :key="t.path"
          :href="t.path"
          :class="`chip cursor-pointer ${path === t.path ? 'chip-blue' : ''}`"
        >
          {{ t.label }}
        </a>
      </nav>

      <CGU v-if="path === '/cgu'" />
      <Confidentialite v-if="path === '/confidentialite'" :contact="contact" />
      <Moderation v-if="path === '/moderation'" :contact="contact" />
      <Mentions v-if="path === '/mentions-legales'" :contact="contact" :updated="updated" />

      <div class="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-line bg-card p-8 text-center">
        <Logo className="h-12 w-12" />
        <button class="btn btn-primary" @click="closePage">
          <Icon name="arrowRight" :size="16" /> Revenir au service
        </button>
      </div>
    </article>

    <SiteFooter />
  </div>
</template>
