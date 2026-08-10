<script setup lang="ts">
import { closePage } from '../../lib/router';
import TopBar from '../layout/TopBar.vue';
import { Icon, Logo } from '../ui';
import Example from './Example.vue';
import Limit from './Limit.vue';
import Mono from './Mono.vue';
import Section from './Section.vue';

/* Pilier du champ générique. Page d'information : elle doit rester utile même
   pour qui repart chez un concurrent — c'est la condition pour qu'elle se
   classe, et la seule façon honnête d'aborder le sujet. */

const CRITERIA = [
  {
    q: 'Le site peut-il lire vos messages ?',
    a:
      "C'est la question qui décide de tout, et la réponse est presque toujours oui. « Connexion sécurisée » ou " +
      "le cadenas du navigateur ne parlent que du transport : le message est déchiffré en arrivant sur le " +
      "serveur, qui le lit et le relaie. Seul le chiffrement de bout en bout, où les clés n'existent que sur les " +
      "appareils, met le contenu hors de portée de l'hébergeur.",
    proxima: 'Non. MP et salons sont chiffrés de bout en bout ; le serveur ne relaie que des enveloppes opaques.',
  },
  {
    q: 'Que garde-t-il, et pendant combien de temps ?',
    a:
      "Un service qui affiche l'historique de vos conversations à la reconnexion les stocke, donc quelqu'un peut " +
      "les lire, et une réquisition peut les obtenir. Cherchez la durée de conservation dans la politique de " +
      "confidentialité : si elle n'y figure pas, c'est en général qu'il n'y a pas de limite.",
    proxima: "Rien de durable : aucune base de données de contenu, tout vit en mémoire avec une minuterie.",
  },
  {
    q: 'Faut-il un email, un numéro, un compte ?',
    a:
      "Chaque information demandée à l'inscription est un point de rattachement entre votre pseudo et votre " +
      "identité réelle. Un numéro de téléphone est le plus lourd de tous : il est nominatif, et il survit à la " +
      "suppression du compte.",
    proxima: 'Rien de tout cela : un pseudo, un âge et une ville, déclarés et non vérifiés.',
  },
  {
    q: 'Y a-t-il de la publicité ou des traceurs ?',
    a:
      "Un site anonyme qui charge une régie publicitaire transmet à un tiers votre adresse IP, votre navigateur " +
      "et les pages visitées. L'anonymat vis-à-vis des autres utilisateurs reste entier ; celui vis-à-vis de " +
      "l'industrie publicitaire n'existe plus.",
    proxima: 'Aucune publicité, aucun traceur, aucun script tiers — la page ne charge rien qui ne vienne du site.',
  },
  {
    q: 'Que se passe-t-il quand quelqu’un dérape ?',
    a:
      "C'est le critère qu'on oublie, et celui qui a fait fermer les grands chats anonymes. Un service sans " +
      "signalement effectif ne protège pas ses utilisateurs, il les expose — et finit par disparaître, en " +
      "emportant ses usages légitimes.",
    proxima: 'Signalement par tout participant, examen, retrait ciblé du message et exclusion possible.',
  },
  {
    q: 'Peut-on vérifier ce qu’il affirme ?',
    a:
      "Toutes les promesses ci-dessus sont des affirmations. Un code source ouvert est ce qui permet de les " +
      "contrôler plutôt que de les croire — c'est la différence entre une politique de confidentialité et une " +
      "preuve.",
    proxima: 'Code source public sous licence AGPL-3.0 : chaque affirmation de cette page est vérifiable.',
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
        <p class="mb-3 text-sm font-semibold text-blue">Guide · chat anonyme</p>
        <h1
          class="font-display text-[clamp(2rem,5vw,3.1rem)] font-semibold leading-[1.06] tracking-tight"
          style="text-wrap: balance"
        >
          Chat anonyme sans inscription&nbsp;: ce que ça veut dire vraiment
        </h1>
        <p class="mt-5 max-w-xl text-[15.5px] leading-relaxed text-muted">
          «&nbsp;Anonyme&nbsp;» est écrit sur presque tous les sites de discussion, et ne désigne pas la même
          chose sur deux d'entre eux. Cette page donne
          <strong class="text-ink">six questions</strong> à poser à n'importe quel service — y compris celui-ci —
          et dit ce qu'aucun ne peut promettre.
        </p>
      </div>

      <Section eyebrow="Le malentendu" title="Sans inscription ne veut pas dire anonyme">
        <p>
          Ne pas demander de compte supprime <strong class="text-ink">une</strong> trace, la plus visible. Cela ne
          dit rien du reste&nbsp;: le site peut lire et conserver vos messages, enregistrer votre adresse IP, vous
          reconnaître d'une visite à l'autre par les caractéristiques de votre navigateur, ou confier tout cela à
          des traceurs publicitaires. Un service «&nbsp;sans inscription&nbsp;» qui garde l'historique de vos
          conversations n'est pas un service anonyme&nbsp;: c'est un service sans mot de passe.
        </p>
        <Example title="La confusion la plus fréquente">
          Le cadenas du navigateur et la mention «&nbsp;connexion chiffrée&nbsp;» ne concernent que le trajet
          entre votre appareil et le serveur. Arrivé là, le message est en clair. C'est utile contre quelqu'un qui
          écouterait le réseau&nbsp;; ce n'est rien contre l'hébergeur, qui est justement celui qui conserve.
        </Example>
      </Section>

      <Section eyebrow="La méthode" title="Six questions, et les réponses de Proxima">
        <p>
          Aucune ne demande de compétence technique&nbsp;: les réponses se trouvent dans la politique de
          confidentialité d'un service, ou dans son silence.
        </p>
        <div class="mt-6 flex flex-col gap-5">
          <div v-for="(item, i) in CRITERIA" :key="item.q" class="rounded-xl border border-line bg-card p-5">
            <h3 class="font-display text-[16.5px] font-semibold text-ink">
              <span class="mr-2 text-blue">{{ i + 1 }}.</span>{{ item.q }}
            </h3>
            <p class="mt-2 text-[14.5px] leading-relaxed">{{ item.a }}</p>
            <p class="mt-3 border-l-2 border-blue pl-3 text-[14px] text-ink">
              <strong class="text-blue">Proxima —</strong> {{ item.proxima }}
            </p>
          </div>
        </div>
      </Section>

      <Section eyebrow="Honnêteté" title="Ce qu'aucun chat anonyme ne peut promettre">
        <p>
          Un service qui prétend le contraire ment, et la liste vaut aussi pour celui-ci&nbsp;:
        </p>
        <ul class="mt-4 flex flex-col gap-2.5">
          <Limit>
            <strong class="text-ink">Votre adresse IP atteint l'hébergeur</strong>, comme pour tout site web.
            Seul un accès par Tor l'évite — Proxima en propose un, mais l'immense majorité des visites passe par
            la voie ordinaire.
          </Limit>
          <Limit>
            <strong class="text-ink">Vos interlocuteurs lisent ce que vous écrivez</strong>, peuvent le copier et
            en faire une capture d'écran. Le chiffrement protège du serveur, pas des personnes à qui vous parlez.
          </Limit>
          <Limit>
            <strong class="text-ink">Vous restez la première fuite</strong> : un prénom, un lieu de travail, une
            photo suffisent à lever l'anonymat que la technique préservait.
          </Limit>
          <Limit>
            <strong class="text-ink">Un âge déclaré n'est pas un âge vérifié</strong> — chez Proxima comme
            ailleurs. La majorité annoncée est une règle, pas un contrôle.
          </Limit>
        </ul>
      </Section>

      <Section eyebrow="Pourquoi ils ferment" title="Le critère qu'on oublie : la modération">
        <p>
          Les grands chats anonymes francophones et internationaux ont presque tous disparu — Omegle en 2023, ICQ
          et Coco en 2024. Aucun n'a été fermé pour avoir protégé la vie privée de ses utilisateurs&nbsp;; tous
          l'ont été, ou s'y sont résignés, faute d'avoir traité les abus. Un service sans voie de signalement
          n'est pas plus libre&nbsp;: il est simplement en sursis, et ses usages légitimes disparaissent avec lui.
          Le détail de chaque fermeture est sur la page
          <a href="/alternatives" class="text-blue hover:underline">alternatives</a>.
        </p>
      </Section>

      <Section eyebrow="Le cas Proxima" title="Un chat anonyme de proximité">
        <p>
          Proxima applique les six réponses ci-dessus&nbsp;: pas de compte, chiffrement de bout en bout de
          <strong class="text-ink">tous</strong> les échanges, aucune conservation, aucune publicité, signalement
          effectif, code ouvert. Sa particularité est la <strong class="text-ink">proximité</strong>&nbsp;: vous
          parlez aux personnes situées dans un rayon de <Mono>75 km</Mono>, à partir du nom de la ville que vous
          déclarez — jamais d'une position GPS.
        </p>
        <p class="mt-3">
          Le fonctionnement est détaillé et démontré en direct sur
          <a href="/en-savoir-plus" class="text-blue hover:underline">Comment ça marche</a>, et
          <a href="/villes" class="text-blue hover:underline">la liste des villes</a> montre ce qui est à portée
          depuis chacune.
        </p>
      </Section>

      <div class="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-line bg-card p-8 text-center">
        <Logo className="h-12 w-12" />
        <h2 class="font-display text-2xl font-semibold">Essayer, sans rien donner</h2>
        <p class="max-w-md text-sm text-muted">
          Un pseudo, un âge, une ville. Aucun compte, aucun email. Vous fermez l'onglet, il ne reste rien.
        </p>
        <button class="btn btn-primary" @click="closePage">
          <Icon name="arrowRight" :size="16" /> Entrer dans le service
        </button>
      </div>
    </article>
  </div>
</template>
