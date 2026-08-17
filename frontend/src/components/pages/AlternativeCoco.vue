<script setup lang="ts">
import { onMounted } from 'vue';
import { closePage } from '../../lib/router';
import SiteFooter from '../layout/SiteFooter.vue';
import TopBar from '../layout/TopBar.vue';
import { Icon, Logo } from '../ui';
import Mono from './Mono.vue';
import Pillar from './Pillar.vue';
import Section from './Section.vue';

/* Comparatif : côté Coco, uniquement des faits établis publiquement (instruction
   judiciaire, communiqués du parquet, presse) ; côté Proxima, le fonctionnement
   documenté sur les autres pages. La page doit rester défendable mot à mot. */
const COMPARISON = [
  {
    point: 'Inscription',
    coco: 'Aucune, mais des fonctions payantes',
    proxima: 'Aucune, et tout est gratuit — pas de publicité non plus',
  },
  {
    point: 'Lecture de vos messages',
    coco: 'Lisibles par le site',
    proxima: 'Chiffrés de bout en bout : illisibles pour le serveur',
  },
  {
    point: 'Après votre départ',
    coco: 'Aucune transparence sur ce qui restait',
    proxima: "Tout s'efface — il n'existe aucune base de données de contenu",
  },
  {
    point: 'Signalements',
    coco: 'Sans suite — le site a été cité dans environ 23 000 procédures',
    proxima: 'Examinés, retrait ciblé du contenu, exclusion possible',
  },
  {
    point: 'Coopération avec la justice',
    coco: 'Structure opaque, domaine délocalisé à Guernesey',
    proxima: 'Point de contact public (DSA), réponse aux réquisitions',
  },
];

const FAQ = [
  {
    q: 'Proxima a-t-il un lien avec Coco ?',
    a:
      "Aucun. Ni les mêmes personnes, ni le même code, ni la même philosophie. Cette page existe parce que " +
      "beaucoup de gens cherchent encore « coco chat » ou « alternative à coco », et qu'ils méritent une " +
      "réponse honnête plutôt qu'un clone douteux.",
  },
  {
    q: 'Coco (coco.gg) va-t-il rouvrir ?',
    a:
      "Le site a été saisi par les autorités en juin 2024 et son exploitant mis en examen. Des sites reprenant " +
      "le nom ou le logo apparaissent régulièrement : aucun n'est « officiel », et leur confier un pseudo, une " +
      "adresse email ou un paiement est risqué.",
  },
  {
    q: 'Faut-il créer un compte ou payer ?',
    a:
      "Non. Vous entrez avec un pseudo, un âge et une ville — rien d'autre, et rien n'est vérifié ni conservé. " +
      "Il n'y a ni offre payante, ni publicité, ni revente de données.",
  },
  {
    q: 'Retrouve-t-on les discussions par ville ?',
    a:
      "Oui, c'est le cœur du service : vous discutez avec les personnes proches de la ville que vous déclarez, " +
      "sans jamais transmettre votre position GPS. Vous pouvez aussi créer des salons, publics ou privés.",
  },
  {
    q: 'Puisque c’est chiffré, peut-on tout dire ?',
    a:
      "Non. Le chiffrement met vos échanges hors de portée de l'hébergeur, pas hors de portée des participants : " +
      "toute personne présente peut signaler un message, et un signalement est examiné et suivi d'effet. " +
      "Le service est par ailleurs réservé aux 18 ans et plus.",
  },
];

onMounted(() => {
  window.scrollTo(0, 0);
});
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
        <p class="mb-3 text-sm font-semibold text-blue">Alternative à Coco</p>
        <h1
          class="font-display text-[clamp(2rem,5vw,3.1rem)] font-semibold leading-[1.06] tracking-tight"
          style="text-wrap: balance"
        >
          Après Coco&nbsp;: un chat anonyme qui n'en répète pas les erreurs
        </h1>
        <p class="mt-5 max-w-xl text-[15.5px] leading-relaxed text-muted">
          Vous cherchiez <Mono>coco.gg</Mono>&nbsp;? Le site a été fermé par la justice, et il ne reviendra pas.
          Proxima offre ce que ses habitués venaient y chercher — parler aux gens de sa ville,
          <strong class="text-ink">sans inscription</strong> — sur des fondations opposées. Aucun lien avec
          l'ancien site&nbsp;: voici ce qui change, et pourquoi.
        </p>
      </div>

      <!-- Les faits -->
      <Section eyebrow="Les faits" title="Ce qui est arrivé à Coco">
        <p>
          Le 25 juin 2024, la justice française a fait fermer Coco, au terme d'une enquête conduite sous
          l'autorité de la juridiction nationale de lutte contre la criminalité organisée (JUNALCO, parquet de
          Paris). Le site était cité dans
          <strong class="text-ink">environ 23&nbsp;000 procédures judiciaires</strong> ouvertes entre janvier
          2021 et mai 2024&nbsp;: guets-apens, violences homophobes, pédocriminalité, proxénétisme, trafics. Son
          fondateur a été mis en examen le 9 janvier 2025.
        </p>
        <p class="mt-3">
          Ce qui a condamné Coco, ce n'est pas l'anonymat&nbsp;: c'est
          <strong class="text-ink">l'absence de tout le reste</strong>. Pas de modération réelle, des
          signalements sans suite, aucune réponse aux autorités — et un déménagement de <Mono>coco.fr</Mono>
          vers un domaine de Guernesey (<Mono>coco.gg</Mono>) pour s'éloigner du droit français. Un chat anonyme
          n'a pas à fonctionner comme ça, et la suite de cette page le montre.
        </p>
      </Section>

      <!-- L'essentiel -->
      <Section eyebrow="L'essentiel" title="Ce que vous veniez y chercher, vous le retrouvez ici">
        <p>
          Pas de compte, pas d'email, pas d'application à installer&nbsp;: vous entrez avec un
          <strong class="text-ink">pseudo, un âge et une ville</strong>, et vous discutez — dans le salon de
          votre région, dans des salons thématiques, ou en messages privés. Tout se passe dans le navigateur,
          sur ordinateur comme sur mobile, et tout est gratuit.
        </p>
        <div class="mt-5 grid gap-3 sm:grid-cols-3">
          <Pillar icon="users" title="Sans compte" text="Un pseudo suffit. Rien à créer, rien à retenir." />
          <Pillar icon="pin" title="Par ville" text="Les personnes proches de chez vous, sans GPS." />
          <Pillar icon="chat" title="Salons et MP" text="Salons publics ou privés, messages privés chiffrés." />
        </div>
        <p class="mt-4">
          La proximité fonctionne à partir du <strong class="text-ink">nom de votre ville</strong>, jamais de
          votre position&nbsp;: le détail est expliqué — et démontré en direct — sur la page
          <a href="/en-savoir-plus" class="text-blue hover:underline">Comment ça marche</a>.
        </p>
      </Section>

      <!-- La différence -->
      <Section eyebrow="La différence" title="Ce que Proxima fait à l'opposé de Coco">
        <p>
          Anonyme ne veut pas dire ingouvernable, et éphémère ne veut pas dire opaque. Les deux services se
          ressemblent en surface&nbsp;; en dessous, tout diffère&nbsp;:
        </p>
        <div class="mt-5 overflow-x-auto">
          <table class="w-full min-w-[560px] border-collapse text-[14px]">
            <thead>
              <tr class="border-b border-line text-left">
                <th class="py-2.5 pr-4 font-semibold text-ink"></th>
                <th class="py-2.5 pr-4 font-semibold text-ink">Coco (fermé)</th>
                <th class="py-2.5 font-semibold text-blue">Proxima</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in COMPARISON" :key="row.point" class="border-b border-line/60 align-top">
                <td class="py-2.5 pr-4 font-semibold text-ink">{{ row.point }}</td>
                <td class="py-2.5 pr-4">{{ row.coco }}</td>
                <td class="py-2.5">{{ row.proxima }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="mt-4">
          Le fonctionnement complet est public&nbsp;: la
          <a href="/moderation" class="text-blue hover:underline">politique de modération</a> détaille le
          traitement des signalements, la
          <a href="/confidentialite" class="text-blue hover:underline">politique de confidentialité</a> énumère
          le peu de données traitées, et le code source du service est ouvert.
        </p>
      </Section>

      <!-- Honnêteté -->
      <Section eyebrow="Honnêteté" title="À qui cette page ne s'adresse pas">
        <p>
          Si ce que vous cherchiez dans Coco, c'est ce qui l'a fait fermer, Proxima n'est pas pour vous. Le
          service est <strong class="text-ink">réservé aux 18 ans et plus</strong>, chaque participant peut
          signaler un message, les signalements sont examinés et suivis d'effet — retrait du contenu, exclusion
          — et nous répondons aux demandes des autorités. Le chiffrement protège vos conversations de
          l'hébergeur&nbsp;; il ne protège personne de ses interlocuteurs, ni de la loi.
        </p>
      </Section>

      <!-- FAQ -->
      <Section eyebrow="Questions fréquentes" title="Coco, Proxima : ce qu'on nous demande">
        <dl class="mt-1">
          <template v-for="item in FAQ" :key="item.q">
            <dt class="mt-5 font-semibold text-ink">{{ item.q }}</dt>
            <dd class="mt-1.5">{{ item.a }}</dd>
          </template>
        </dl>
      </Section>

      <!-- CTA -->
      <div class="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-line bg-card p-8 text-center">
        <Logo className="h-12 w-12" />
        <h2 class="font-display text-2xl font-semibold">Essayez, il n'y a rien à créer</h2>
        <p class="max-w-md text-sm text-muted">
          Un pseudo, un âge, une ville — et vous parlez aux gens d'à côté. Quand vous fermez l'onglet, il ne
          reste rien.
        </p>
        <button class="btn btn-primary" @click="closePage">
          <Icon name="arrowRight" :size="16" /> Entrer dans le service
        </button>
      </div>
    </article>

    <SiteFooter />
  </div>
</template>
