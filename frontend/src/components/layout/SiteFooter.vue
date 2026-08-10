<script setup lang="ts">
import { DISCORD_INVITE, SOURCE_URL } from '../../lib/links';
import { DiscordGlyph, GitHubGlyph } from '../ui';
import OnionAccess from './OnionAccess.vue';

/* ==========================================================================
 * Pied de page du site — partagé par l'accueil et les pages juridiques.
 *
 * Trois registres séparés, volontairement : les deux portes sortantes d'abord,
 * les documents juridiques ensuite, l'accès Tor en dernier. Noyer « Discord » ou
 * « Code source » au milieu de « CGU · Confidentialité · Modération » les
 * rendrait invisibles — ce ne sont pas des documents de conformité.
 *
 * Les deux portes ne se ressemblent pas, et c'est le sujet : Discord porte sa
 * couleur de marque (on la reconnaît avant de la lire), le code source reste en
 * encre. Ce site affirme ne pas pouvoir lire vos messages ; le code est ce qui
 * rend l'affirmation vérifiable, et une preuve n'a pas à être colorée pour
 * exister. L'accent bleu reste au produit.
 * ======================================================================== */
</script>

<template>
  <footer class="relative z-10 border-t border-line/60 px-5 py-5 text-center text-[11px] text-faint sm:px-8">
    <p class="mb-3.5 flex flex-wrap items-center justify-center gap-2">
      <!-- Invitation vide ⇒ rien à afficher (cf. lib/links.ts) : pas de lien mort.
           Le code source, lui, a toujours une valeur : l'AGPL en fait une
           obligation, pas un ornement. -->
      <a v-if="DISCORD_INVITE" class="discord-link" :href="DISCORD_INVITE" target="_blank" rel="noopener noreferrer">
        <DiscordGlyph :size="16" />Rejoindre la communauté sur Discord
      </a>
      <a class="source-link" :href="SOURCE_URL" target="_blank" rel="noopener noreferrer">
        <GitHubGlyph :size="15" />Code source
        <span class="source-link__licence">AGPL-3.0</span>
      </a>
    </p>
    <!-- Registre des pages de contenu, séparé des documents de conformité qui
         suivent : ce ne sont pas des textes qu'on consulte par obligation. Elles
         ont besoin de ce pied de page pour exister aux yeux d'un moteur — les
         liens du DOM rendu sont les seuls qu'il suive, et c'est le seul bloc
         présent sur tous les écrans. Sans lui, elles seraient orphelines. -->
    <p class="mb-2">
      <a href="/chat-anonyme" class="hover:text-blue">Chat anonyme</a> ·
      <a href="/villes" class="hover:text-blue">Tchat par ville</a> ·
      <a href="/alternatives" class="hover:text-blue">Alternatives</a> ·
      <a href="/alternative-coco" class="hover:text-blue">Alternative à Coco</a> ·
      <a href="/alternative-omegle" class="hover:text-blue">Alternative à Omegle</a>
    </p>
    <p>
      <a href="/cgu" class="hover:text-blue">Conditions d'utilisation</a> ·
      <a href="/confidentialite" class="hover:text-blue">Confidentialité</a> ·
      <a href="/moderation" class="hover:text-blue">Modération</a> ·
      <a href="/mentions-legales" class="hover:text-blue">Mentions légales</a>
    </p>
    <OnionAccess />
  </footer>
</template>
