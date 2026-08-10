<script setup lang="ts">
import { closePage } from '../../lib/router';
import TopBar from '../layout/TopBar.vue';
import { Icon, Logo } from '../ui';
import Limit from './Limit.vue';
import Section from './Section.vue';

/* Hub du champ « alternative à … ». Chaque fermeture est datée et sourçable :
   une page qui prétend expliquer des faits n'a pas le droit de les arrondir. */

const CLOSURES = [
  {
    name: 'Omegle',
    date: '8 novembre 2023',
    years: '2009–2023',
    what: 'Vidéo et texte avec un inconnu tiré au sort, à l’échelle mondiale.',
    why:
      "Fermé par son propre fondateur, qui a expliqué que le site n'était plus tenable « ni financièrement, ni " +
      "psychologiquement » : quatorze ans de lutte contre les abus, des procédures judiciaires, et une " +
      "modération que le modèle du tirage au sort rendait pratiquement impossible.",
    lesson:
      "Mettre deux inconnus en relation sans aucun cadre ne demande presque rien à construire, et devient " +
      "ingérable à grande échelle.",
    page: '/alternative-omegle',
  },
  {
    name: 'Coco (coco.gg)',
    date: '25 juin 2024',
    years: '2003–2024',
    what: 'Le plus gros chat anonyme francophone, avec des salons par ville et par thème.',
    why:
      "Fermé par la justice française, au terme d'une enquête conduite sous l'autorité de la JUNALCO (parquet " +
      "de Paris). Le site était cité dans environ 23 000 procédures judiciaires ouvertes entre janvier 2021 et " +
      "mai 2024 ; son fondateur a été mis en examen le 9 janvier 2025.",
    lesson:
      "Ce n'est pas l'anonymat qui a été sanctionné, mais l'absence de tout le reste : aucune modération réelle, " +
      "des signalements sans suite, aucune réponse aux autorités.",
    page: '/alternative-coco',
  },
  {
    name: 'ICQ',
    date: '26 juin 2024',
    years: '1996–2024',
    what: 'La messagerie instantanée des débuts du web, où l’on était un numéro plutôt qu’un nom.',
    why:
      "Aucun scandale ici : une décision commerciale de VK, propriétaire depuis 2010, qui a redirigé ses " +
      "utilisateurs vers ses propres messageries. ICQ comptait plus de cent millions de comptes à son apogée.",
    lesson:
      "Un service gratuit dépend de la stratégie de son propriétaire. Vingt-huit ans d'existence ne garantissent " +
      "pas le mois suivant.",
    page: null,
  },
];
</script>

<template>
  <div class="min-h-full pb-24">
    <TopBar column="text" :onHome="closePage">
      <button class="btn btn-ghost px-3" @click="closePage">
        <Icon name="back" :size="16" /> Retour
      </button>
    </TopBar>

    <article class="mx-auto max-w-3xl px-5">
      <div class="border-b border-line py-12">
        <p class="mb-3 text-sm font-semibold text-blue">Alternatives</p>
        <h1
          class="font-display text-[clamp(2rem,5vw,3.1rem)] font-semibold leading-[1.06] tracking-tight"
          style="text-wrap: balance"
        >
          Les chats anonymes ferment. Voici pourquoi, et par quoi les remplacer.
        </h1>
        <p class="mt-5 max-w-xl text-[15.5px] leading-relaxed text-muted">
          En trois ans, la plupart des grands lieux de discussion anonyme ont disparu. Les raisons diffèrent, et
          <strong class="text-ink">aucune n'est l'anonymat en soi</strong>. Voici ce qui est arrivé à chacun, et
          ce que ça devrait changer dans votre façon d'en choisir un.
        </p>
      </div>

      <Section eyebrow="Les fermetures" title="Trois histoires, trois causes">
        <div class="mt-1 flex flex-col gap-5">
          <div v-for="site in CLOSURES" :key="site.name" class="rounded-xl border border-line bg-card p-5">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h3 class="font-display text-[17px] font-semibold text-ink">{{ site.name }}</h3>
              <span class="text-[12.5px] text-faint">{{ site.years }} · fermé le {{ site.date }}</span>
            </div>
            <p class="mt-1.5 text-[14px] italic text-muted">{{ site.what }}</p>
            <p class="mt-3 text-[14.5px] leading-relaxed">{{ site.why }}</p>
            <p class="mt-3 border-l-2 border-blue pl-3 text-[14px] text-ink">
              <strong class="text-blue">À retenir —</strong> {{ site.lesson }}
            </p>
            <p v-if="site.page" class="mt-3 text-[14px]">
              <a :href="site.page" class="text-blue hover:underline">Venir de {{ site.name }} → ce qui change ici</a>
            </p>
          </div>
        </div>
      </Section>

      <Section eyebrow="Le piège" title="Méfiez-vous des clones qui reprennent les noms">
        <p>
          Chaque fermeture fait apparaître des sites qui reprennent le nom, le logo et l'apparence du disparu pour
          capter son public. Aucun n'est «&nbsp;officiel&nbsp;», et beaucoup n'ont retenu de l'original que ce qui
          l'a tué. Les signaux qui doivent vous faire fermer l'onglet&nbsp;:
        </p>
        <ul class="mt-4 flex flex-col gap-2.5">
          <Limit>
            <strong class="text-ink">Aucune mention légale, aucun éditeur identifiable</strong> — personne à qui
            s'adresser en cas de problème, et personne pour répondre à la justice.
          </Limit>
          <Limit>
            <strong class="text-ink">Un paiement, où l'original était gratuit</strong> — carte bancaire ou SMS
            surtaxé sur un site anonyme, c'est le contraire de l'anonymat.
          </Limit>
          <Limit>
            <strong class="text-ink">Aucun bouton de signalement</strong> — c'est précisément ce qui a fait fermer
            les originaux, reproduit à l'identique.
          </Limit>
          <Limit>
            <strong class="text-ink">Une promesse de webcam «&nbsp;sans limite&nbsp;»</strong> — l'appât, et le
            plus court chemin vers ce que vous ne cherchiez pas.
          </Limit>
        </ul>
      </Section>

      <Section eyebrow="Choisir" title="Les six questions à poser au remplaçant">
        <p>
          Elles ne demandent aucune compétence technique et se répondent en lisant la politique de confidentialité
          d'un service&nbsp;: peut-il lire vos messages&nbsp;? que conserve-t-il, et combien de temps&nbsp;?
          exige-t-il un email ou un numéro&nbsp;? charge-t-il de la publicité&nbsp;? que se passe-t-il quand
          quelqu'un dérape&nbsp;? peut-on vérifier ses affirmations&nbsp;? Le détail de chacune, avec ce qu'une
          mauvaise réponse implique, est sur
          <a href="/chat-anonyme" class="text-blue hover:underline">Chat anonyme&nbsp;: le guide</a>.
        </p>
      </Section>

      <Section eyebrow="Ce que propose Proxima" title="Un chat anonyme, mais de proximité">
        <p>
          Proxima n'est pas un clone&nbsp;: pas de webcam, pas de tirage au sort mondial. Vous discutez sans
          compte avec les personnes situées <strong class="text-ink">autour de vous</strong>, à partir du nom de
          la ville que vous déclarez. Tous les échanges — messages privés comme salons — sont chiffrés de bout en
          bout, rien n'est conservé, il n'y a ni publicité ni traceur, et le code est public. Le signalement, lui,
          existe et aboutit&nbsp;: c'est la leçon des trois histoires ci-dessus.
        </p>
        <p class="mt-3">
          Pour voir ce qui est à portée de chez vous, la
          <a href="/villes" class="text-blue hover:underline">liste des villes</a> le montre commune par commune.
        </p>
      </Section>

      <div class="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-line bg-card p-8 text-center">
        <Logo className="h-12 w-12" />
        <h2 class="font-display text-2xl font-semibold">Reprendre une conversation</h2>
        <p class="max-w-md text-sm text-muted">
          Un pseudo, un âge, une ville — rien à créer, rien à payer. Vous fermez l'onglet, il ne reste rien.
        </p>
        <button class="btn btn-primary" @click="closePage">
          <Icon name="arrowRight" :size="16" /> Entrer dans le service
        </button>
      </div>
    </article>
  </div>
</template>
