<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import type { SeoCity } from '../../lib/cities-seo';
import { closePage, navigate } from '../../lib/router';
import { useStore } from '../../store/useStore';
import SiteFooter from '../layout/SiteFooter.vue';
import TopBar from '../layout/TopBar.vue';
import { Icon, Logo } from '../ui';
import Example from './Example.vue';
import Mono from './Mono.vue';
import Pillar from './Pillar.vue';
import Section from './Section.vue';

/* ==========================================================================
 * Page d'une ville (`/tchat/nancy`).
 *
 * Ce qu'elle affiche est calculé depuis la base géographique du service et non
 * rédigé ville par ville : combien de communes sont réellement à portée, et
 * lesquelles. C'est ce qui la distingue d'une page satellite — la donnée est
 * propre à la ville, vérifiable, et utile avant même d'entrer.
 *
 * Elle a aussi une fonction, pas seulement un texte : le bouton d'entrée
 * pré-remplit la ville dans le formulaire. Arriver par « tchat Nancy » et
 * trouver « Nancy » déjà saisi est le service que la page promet.
 * ======================================================================== */

const props = defineProps<{ city: SeoCity }>();

const st = useStore();

const situation = computed(() =>
  [props.city.subdivision, props.city.country].filter(Boolean).join(', '),
);

const population = computed(() => props.city.population.toLocaleString('fr-FR'));
const nearbyTotal = computed(() => props.city.nearbyTotal.toLocaleString('fr-FR'));
const nearest = computed(() => props.city.nearby[0] ?? null);

/** Virgule décimale : la donnée reste un nombre, seul l'affichage est français. */
const km = (value: number) => String(value).replace('.', ',');

// Une ville voisine reste la même page avec une autre propriété : Vue réutilise
// le composant sans le remonter, et on resterait au milieu de la page suivante.
onMounted(() => window.scrollTo(0, 0));
watch(() => props.city.slug, () => window.scrollTo(0, 0));

/**
 * Entrer avec la ville déjà choisie. On transmet une suggestion complète, celle
 * qu'aurait produite l'autocomplétion : c'est l'identifiant qui désigne la
 * commune côté serveur, le nom seul ne suffirait pas à lever les homonymes.
 * `region` reste vide — il ne sert qu'à nommer le salon régional, que le serveur
 * détermine lui-même à partir de l'identifiant.
 */
function enter() {
  st.seedCity({
    id: props.city.id,
    name: props.city.name,
    admin: props.city.subdivision ?? '',
    country: props.city.id.split('-')[0],
    countryLabel: props.city.country,
    region: '',
  });
  navigate('/');
}
</script>

<template>
  <div class="min-h-full">
    <TopBar column="text" :onHome="closePage">
      <button class="btn btn-ghost px-3" @click="closePage">
        <Icon name="back" :size="16" /> Retour
      </button>
    </TopBar>

    <article class="mx-auto max-w-3xl px-5 pb-24">
      <!-- Hero -->
      <div class="border-b border-line py-12">
        <p class="mb-3 text-sm font-semibold text-blue">
          Tchat de proximité<span v-if="situation"> · {{ situation }}</span>
        </p>
        <h1
          class="font-display text-[clamp(2rem,5vw,3.1rem)] font-semibold leading-[1.06] tracking-tight"
          style="text-wrap: balance"
        >
          Tchat anonyme à {{ city.name }}
        </h1>
        <p class="mt-5 max-w-xl text-[15.5px] leading-relaxed text-muted">
          Parlez aux gens de {{ city.name }} et des communes voisines, <strong class="text-ink">sans créer de
          compte</strong> et sans laisser de trace. Vos messages sont chiffrés de bout en bout&nbsp;: nous ne
          pouvons pas les lire. À la fermeture de l'onglet, il ne reste rien.
        </p>
        <button class="btn btn-primary mt-6" @click="enter">
          <Icon name="arrowRight" :size="16" /> Discuter depuis {{ city.name }}
        </button>
      </div>

      <!-- Ce qui est à portée : la donnée propre à cette ville -->
      <Section eyebrow="À portée" :title="`Ce qui est à portée depuis ${city.name}`">
        <p>
          {{ city.name }}<span v-if="situation"> ({{ situation }})</span> compte
          <strong class="text-ink">{{ population }} habitants</strong>. Le service vous relie aux personnes
          présentes dans un rayon de <Mono>75 km</Mono>, ce qui représente ici
          <strong class="text-ink">{{ nearbyTotal }} communes</strong> — les plus notables&nbsp;:
        </p>
        <ul class="mt-4 flex flex-wrap gap-x-3 gap-y-2 text-[14px]">
          <li v-for="near in city.nearby" :key="near.name" class="flex items-baseline gap-1.5">
            <a v-if="near.slug" :href="`/tchat/${near.slug}`" class="text-blue hover:underline">{{ near.name }}</a>
            <span v-else class="text-ink">{{ near.name }}</span>
            <span class="text-[12.5px] text-faint">{{ km(near.km) }} km</span>
          </li>
        </ul>
        <Example title="Concrètement">
          Vous entrez en indiquant {{ city.name }}. La liste des personnes proches se remplit avec celles qui ont
          déclaré {{ city.name }} ou l'une de ces communes<span v-if="nearest">, {{ nearest.name }} y compris —
          {{ km(nearest.km) }} km d'ici</span>. Personne n'a transmis sa position&nbsp;: seul le nom d'une commune est
          utilisé, jamais le GPS.
        </Example>
      </Section>

      <!-- Comment ça marche, résumé -->
      <Section eyebrow="Le principe" title="Trois choses à savoir avant d'entrer">
        <div class="grid gap-3 sm:grid-cols-3">
          <Pillar icon="users" title="Sans compte" text="Un pseudo, un âge, une ville. Rien d'autre." />
          <Pillar icon="lock" title="Chiffré" text="MP et salons illisibles pour le serveur." />
          <Pillar icon="clock" title="Éphémère" text="Tout s'efface à la fermeture de l'onglet." />
        </div>
        <p class="mt-5">
          Le détail des mécanismes — clés créées sur votre appareil, proximité sans géolocalisation, durée de vie
          des données — est expliqué et démontré en direct sur la page
          <a href="/en-savoir-plus" class="text-blue hover:underline">Comment ça marche</a>. Si vous comparez
          plusieurs services, les critères qui comptent sont réunis sur
          <a href="/chat-anonyme" class="text-blue hover:underline">Chat anonyme&nbsp;: le guide</a>.
        </p>
      </Section>

      <!-- Cadre -->
      <Section eyebrow="Le cadre" title="Ce que le service n'est pas">
        <p>
          Proxima est réservé aux <strong class="text-ink">18 ans et plus</strong>, et l'anonymat n'y est pas
          une zone de non-droit&nbsp;: chaque participant peut signaler un message, un signalement est examiné et
          suivi d'effet. Le chiffrement met vos échanges hors de portée de l'hébergeur, jamais hors de portée des
          personnes présentes dans la conversation. Les règles sont dans les
          <a href="/cgu" class="text-blue hover:underline">conditions d'utilisation</a> et la
          <a href="/moderation" class="text-blue hover:underline">politique de modération</a>.
        </p>
      </Section>

      <!-- CTA -->
      <div class="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-line bg-card p-8 text-center">
        <Logo className="h-12 w-12" />
        <h2 class="font-display text-2xl font-semibold">Qui est en ligne à {{ city.name }} ?</h2>
        <p class="max-w-md text-sm text-muted">
          La seule façon de le savoir est d'entrer — il n'y a rien à créer, et vous repartez sans laisser de
          trace.
        </p>
        <button class="btn btn-primary" @click="enter">
          <Icon name="arrowRight" :size="16" /> Entrer depuis {{ city.name }}
        </button>
        <p class="text-[12.5px] text-faint">
          <a href="/villes" class="hover:text-blue">Voir toutes les villes couvertes</a>
        </p>
      </div>
    </article>

    <SiteFooter />
  </div>
</template>
