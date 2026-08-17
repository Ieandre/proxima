<script setup lang="ts">
import { computed } from 'vue';
import { SEO_CITIES } from '../../lib/cities-seo';
import { closePage } from '../../lib/router';
import SiteFooter from '../layout/SiteFooter.vue';
import TopBar from '../layout/TopBar.vue';
import { Icon, Logo } from '../ui';
import Mono from './Mono.vue';
import Section from './Section.vue';

/* Sommaire des pages de ville. Sans lui, les 67 pages n'auraient aucun lien
   entrant depuis le site : un moteur ne les découvrirait que par le sitemap,
   c'est-à-dire tard et sans contexte. */

const BY_COUNTRY = [
  { country: 'France', note: 'Communes de plus de 100 000 habitants.' },
  { country: 'Belgique', note: 'Bruxelles et la Wallonie.' },
  { country: 'Suisse', note: 'Cantons romands.' },
  { country: 'Luxembourg', note: '' },
  { country: 'Monaco', note: '' },
];

const groups = computed(() =>
  BY_COUNTRY.map((group) => ({
    ...group,
    cities: SEO_CITIES.filter((city) => city.country === group.country).sort((a, b) =>
      a.name.localeCompare(b.name, 'fr'),
    ),
  })).filter((group) => group.cities.length > 0),
);
</script>

<template>
  <div class="min-h-full">
    <TopBar column="text" :onHome="closePage">
      <button class="btn btn-ghost px-3" @click="closePage">
        <Icon name="back" :size="16" /> Retour
      </button>
    </TopBar>

    <article class="mx-auto max-w-3xl px-5 pb-24">
      <div class="border-b border-line py-12">
        <p class="mb-3 text-sm font-semibold text-blue">Tchat par ville</p>
        <h1
          class="font-display text-[clamp(2rem,5vw,3.1rem)] font-semibold leading-[1.06] tracking-tight"
          style="text-wrap: balance"
        >
          Tchat anonyme, ville par ville
        </h1>
        <p class="mt-5 max-w-xl text-[15.5px] leading-relaxed text-muted">
          Proxima est un service de proximité&nbsp;: vous discutez avec les personnes présentes autour de la ville
          que vous déclarez, dans un rayon de <Mono>75 km</Mono>. <strong class="text-ink">Toutes</strong> les
          communes de France, de Belgique, de Suisse, du Luxembourg et de Monaco sont utilisables à l'entrée — les
          villes ci-dessous ont en plus leur propre page.
        </p>
      </div>

      <Section
        v-for="group in groups"
        :key="group.country"
        :eyebrow="`${group.cities.length} villes`"
        :title="group.country"
      >
        <p v-if="group.note" class="mb-4 text-[14px]">{{ group.note }}</p>
        <ul class="flex flex-wrap gap-x-3 gap-y-2 text-[14.5px]">
          <li v-for="city in group.cities" :key="city.slug">
            <a :href="`/tchat/${city.slug}`" class="text-blue hover:underline">{{ city.name }}</a>
          </li>
        </ul>
      </Section>

      <Section eyebrow="Votre ville n'est pas listée ?" title="Elle fonctionne quand même">
        <p>
          Ces pages n'énumèrent pas les villes <em>couvertes</em>, mais celles sur lesquelles nous avions
          suffisamment à dire pour justifier une page. La base géographique embarquée compte
          <strong class="text-ink">37 756 communes</strong> de France, Belgique, Suisse, Luxembourg et Monaco, et
          n'importe laquelle est acceptée à l'entrée&nbsp;: tapez son nom, l'autocomplétion la trouvera. La
          proximité fonctionnera exactement de la même façon.
        </p>
      </Section>

      <div class="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-line bg-card p-8 text-center">
        <Logo className="h-12 w-12" />
        <h2 class="font-display text-2xl font-semibold">Entrez avec votre ville</h2>
        <p class="max-w-md text-sm text-muted">
          Un pseudo, un âge, une ville — et vous parlez aux gens d'à côté. Rien à créer, rien à installer.
        </p>
        <button class="btn btn-primary" @click="closePage">
          <Icon name="arrowRight" :size="16" /> Entrer dans le service
        </button>
      </div>
    </article>

    <SiteFooter />
  </div>
</template>
