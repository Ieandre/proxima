<script setup lang="ts">
import { closePage } from '../../lib/router';
import SiteFooter from '../layout/SiteFooter.vue';
import TopBar from '../layout/TopBar.vue';
import { Icon, Logo } from '../ui';
import Mono from './Mono.vue';
import Pillar from './Pillar.vue';
import Section from './Section.vue';

/* Page d'acquisition « alternative à Omegle ». La différence de nature — texte
   et proximité contre webcam et tirage au sort mondial — est annoncée dès le
   premier écran : attirer sur un malentendu ne sert personne, et une visite qui
   repart en trois secondes est un mauvais signal autant qu'une déception. */

const COMPARISON = [
  {
    point: 'Format',
    omegle: 'Webcam et texte',
    proxima: 'Texte, images, messages vocaux — pas de webcam',
  },
  {
    point: 'Qui est en face',
    omegle: 'Un inconnu tiré au sort dans le monde entier',
    proxima: 'Des personnes situées à moins de 75 km de vous',
  },
  {
    point: 'Langue',
    omegle: 'Surtout anglophone',
    proxima: 'Francophone : France, Belgique, Suisse, Luxembourg',
  },
  {
    point: 'Conversation',
    omegle: 'Un tête-à-tête, puis « Next »',
    proxima: 'Messages privés et salons où l’on peut revenir',
  },
  {
    point: 'Lecture par le site',
    omegle: 'Conversations lisibles et enregistrées',
    proxima: 'Chiffrées de bout en bout : illisibles pour le serveur',
  },
  {
    point: 'Signalement',
    omegle: 'Modération dépassée par le tirage au sort',
    proxima: 'Signalement par tout participant, retrait ciblé',
  },
];
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
        <p class="mb-3 text-sm font-semibold text-blue">Alternative à Omegle</p>
        <h1
          class="font-display text-[clamp(2rem,5vw,3.1rem)] font-semibold leading-[1.06] tracking-tight"
          style="text-wrap: balance"
        >
          Après Omegle&nbsp;: parler à des inconnus, autrement
        </h1>
        <p class="mt-5 max-w-xl text-[15.5px] leading-relaxed text-muted">
          Omegle a fermé le 8 novembre 2023. Proxima répond à la même envie — parler à quelqu'un qu'on ne connaît
          pas — par un chemin différent, et autant le dire tout de suite&nbsp;: ici c'est
          <strong class="text-ink">du texte, pas de la webcam</strong>, et les gens en face sont
          <strong class="text-ink">près de chez vous</strong> plutôt que tirés au sort dans le monde entier.
        </p>
      </div>

      <Section eyebrow="Les faits" title="Ce qui est arrivé à Omegle">
        <p>
          Le site a fermé le 8 novembre 2023, après quatorze ans d'existence, sur décision de son propre
          fondateur. Dans sa lettre d'adieu, il expliquait qu'Omegle n'était plus tenable
          «&nbsp;<em>ni financièrement, ni psychologiquement</em>&nbsp;»&nbsp;: des années de lutte contre les
          abus, des procédures judiciaires — dont la plainte d'une victime mise en relation avec son agresseur
          alors qu'elle avait onze ans — et une modération que le principe même du tirage au sort rendait
          pratiquement impossible.
        </p>
        <p class="mt-3">
          C'est le point à retenir avant de chercher un remplaçant&nbsp;: ce qui a tué Omegle n'est pas
          l'anonymat, c'est <strong class="text-ink">l'impossibilité de modérer</strong> un service où deux
          inconnus se retrouvent seuls, sans trace et sans recours. Un clone qui reproduit exactement cela n'est
          pas une alternative&nbsp;: c'est le même problème, en attendant la même fin.
        </p>
      </Section>

      <Section eyebrow="La différence" title="Proxima n'est pas un Omegle de remplacement">
        <p>
          Si vous cherchez une roulette à webcams, cette page n'est pas pour vous et vous perdriez votre temps à
          entrer. Si ce que vous cherchiez sur Omegle c'était
          <strong class="text-ink">parler à quelqu'un de nouveau, sans compte et sans conséquence</strong>, alors
          la comparaison vaut la peine&nbsp;:
        </p>
        <div class="mt-5 overflow-x-auto">
          <table class="w-full min-w-[560px] border-collapse text-[14px]">
            <thead>
              <tr class="border-b border-line text-left">
                <th class="py-2.5 pr-4 font-semibold text-ink"></th>
                <th class="py-2.5 pr-4 font-semibold text-ink">Omegle (fermé)</th>
                <th class="py-2.5 font-semibold text-blue">Proxima</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in COMPARISON" :key="row.point" class="border-b border-line/60 align-top">
                <td class="py-2.5 pr-4 font-semibold text-ink">{{ row.point }}</td>
                <td class="py-2.5 pr-4">{{ row.omegle }}</td>
                <td class="py-2.5">{{ row.proxima }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section eyebrow="Le gain" title="Ce que la proximité change">
        <p>
          Sur Omegle, l'inconnu était à l'autre bout du monde et la conversation s'arrêtait au clic suivant. Ici,
          la personne en face est à quelques dizaines de kilomètres&nbsp;: vous partagez une ville, une région, un
          climat, des lieux. La conversation a de quoi commencer, et peut continuer.
        </p>
        <div class="mt-5 grid gap-3 sm:grid-cols-3">
          <Pillar icon="pin" title="À côté" text="Rayon de 75 km autour de votre ville, sans GPS." />
          <Pillar icon="chat" title="Qui dure" text="Salons et messages privés, pas un « Next »." />
          <Pillar icon="lock" title="Chiffré" text="Le serveur ne peut pas lire vos échanges." />
        </div>
        <p class="mt-5">
          La proximité n'utilise <strong class="text-ink">jamais</strong> votre position réelle&nbsp;: seul le nom
          de la ville que vous déclarez à l'entrée est converti en coordonnées approximatives, à partir d'une base
          embarquée. Le mécanisme est démontré en direct sur
          <a href="/en-savoir-plus" class="text-blue hover:underline">Comment ça marche</a>, et
          <a href="/villes" class="text-blue hover:underline">la liste des villes</a> montre ce qui est à portée
          depuis chacune.
        </p>
      </Section>

      <Section eyebrow="Le cadre" title="Sans webcam, et ce n'est pas un oubli">
        <p>
          L'absence de vidéo est un choix. La webcam est ce qui a rendu Omegle impossible à tenir&nbsp;:
          exhibition, captation à l'insu des gens, mineurs exposés en quelques secondes. Proxima est réservé aux
          <strong class="text-ink">18 ans et plus</strong>, tout participant peut signaler un message, et un
          signalement est examiné et suivi d'effet — retrait, exclusion. Le chiffrement met vos échanges hors de
          portée de l'hébergeur&nbsp;; il ne met personne hors de portée de ses interlocuteurs, ni de la loi.
        </p>
        <p class="mt-3">
          Les autres fermetures du même genre — Coco, ICQ — et les critères pour juger un service sont réunis sur
          <a href="/alternatives" class="text-blue hover:underline">la page alternatives</a>.
        </p>
      </Section>

      <div class="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-line bg-card p-8 text-center">
        <Logo className="h-12 w-12" />
        <h2 class="font-display text-2xl font-semibold">Parler à quelqu'un, maintenant</h2>
        <p class="max-w-md text-sm text-muted">
          Un pseudo, un âge, une ville. Aucun compte, aucune webcam, aucune trace&nbsp;: <Mono>75 km</Mono> autour
          de vous, et c'est tout.
        </p>
        <button class="btn btn-primary" @click="closePage">
          <Icon name="arrowRight" :size="16" /> Entrer dans le service
        </button>
      </div>
    </article>

    <SiteFooter />
  </div>
</template>
