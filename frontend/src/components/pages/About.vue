<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import sodium from 'libsodium-wrappers';
import { DISCORD_INVITE, SOURCE_URL } from '../../lib/links';
import { isOnionOrigin } from '../../lib/onion';
import { closePage } from '../../lib/router';
import { useStore } from '../../store/useStore';
import SiteFooter from '../layout/SiteFooter.vue';
import TopBar from '../layout/TopBar.vue';
import { DiscordGlyph, GitHubGlyph, Icon, Logo } from '../ui';
import { EphemeralSchema, ProximitySchema, KeySchema, CipherFlowSchema, RoomsSchema } from './schemas';
import type { Party } from './about-demo';
import Brick from './Brick.vue';
import DemoCard from './DemoCard.vue';
import DemoLoading from './DemoLoading.vue';
import Example from './Example.vue';
import FingerprintView from './FingerprintView.vue';
import KnowCard from './KnowCard.vue';
import Limit from './Limit.vue';
import Mono from './Mono.vue';
import PaddingView from './PaddingView.vue';
import Pillar from './Pillar.vue';
import Section from './Section.vue';
import ServerView from './ServerView.vue';
import Step from './Step.vue';

const ready = ref(false);
const parties = ref<{ alice: Party; bob: Party; mitm: Party } | null>(null);
// Chargé une seule fois par `App.vue` et distribué par le store : cet écran, les
// pages juridiques et le pied de page en ont besoin, l'appel partait trois fois.
const { legal } = storeToRefs(useStore());

let alive = true;
onMounted(async () => {
  await sodium.ready;
  if (!alive) return;
  parties.value = {
    alice: sodium.crypto_box_keypair(),
    bob: sodium.crypto_box_keypair(),
    mitm: sodium.crypto_box_keypair(),
  };
  ready.value = true;
});
onUnmounted(() => {
  alive = false;
});

onMounted(() => {
  window.scrollTo(0, 0);
});
</script>

<template>
  <div class="min-h-full">
    <!-- Barre -->
    <TopBar column="text" :onHome="closePage">
      <button class="btn btn-ghost px-3" @click="closePage">
        <Icon name="back" :size="16" /> Retour
      </button>
    </TopBar>

    <article class="mx-auto max-w-3xl px-5 pb-24">
      <!-- Hero -->
      <div class="border-b border-line py-12">
        <p class="mb-3 text-sm font-semibold text-blue">Comment ça marche · sécurité</p>
        <h1
          class="font-display text-[clamp(2rem,5vw,3.1rem)] font-semibold leading-[1.06] tracking-tight"
          style="text-wrap: balance"
        >
          Comment Proxima vous protège, expliqué simplement.
        </h1>
        <p class="mt-5 max-w-xl text-[15.5px] leading-relaxed text-muted">
          Pas de promesse en l'air&nbsp;: cette page vous montre <strong class="text-ink">concrètement</strong> ce
          que le service voit, ce qu'il ne peut pas voir, et pourquoi. Plusieurs démonstrations sont
          <strong class="text-ink">manipulables ici même</strong>, avec la vraie machinerie cryptographique du
          site.
        </p>
      </div>

      <!-- En une phrase -->
      <Section eyebrow="L'essentiel" title="En une phrase">
        <p>
          Vous entrez sans compte avec un pseudo, un âge et une ville&nbsp;; vous discutez avec les personnes proches
          ou dans des salons&nbsp;; vos messages privés sont chiffrés sur votre appareil&nbsp;; et à la fermeture de
          l'onglet, <strong class="text-ink">il ne reste rien</strong>.
        </p>
        <div class="mt-5 grid gap-3 sm:grid-cols-3">
          <Pillar icon="lock" title="Chiffré" text="MP et salons, tous illisibles pour le serveur." />
          <Pillar icon="clock" title="Éphémère" text="Tout vit en mémoire, rien sur disque." />
          <Pillar icon="pin" title="Sans GPS" text="Seul le nom de votre ville est utilisé." />
        </div>
      </Section>

      <!-- Anonymat -->
      <Section eyebrow="Anonymat" title="Qui êtes-vous, pour le service ? Personne.">
        <p>
          Il n'y a <strong class="text-ink">ni inscription, ni email, ni mot de passe, ni numéro</strong>. Votre
          «&nbsp;identité&nbsp;» se résume à trois informations que vous déclarez à l'entrée&nbsp;: un pseudo, un âge et
          une ville. Elle n'existe que le temps de votre visite&nbsp;: dès que l'onglet se ferme, elle est détruite,
          avec vos conversations et vos salons.
        </p>
        <Example title="Exemple concret">
          Vous arrivez en tant que <Mono>VoisinBleu, 30 ans, Metz</Mono>. Le serveur garde cette fiche en
          <em>mémoire vive</em> avec une minuterie de quelques dizaines de secondes, prolongée tant que votre onglet
          est ouvert. Vous fermez l'onglet&nbsp;: la minuterie expire, la fiche s'efface. Aucune trace n'est écrite sur
          un disque, aucun historique n'est conservé.
        </Example>
        <EphemeralSchema />
      </Section>

      <!-- Proximité -->
      <Section eyebrow="Proximité" title="« Autour de vous », sans jamais vous localiser">
        <p>
          Proxima ne demande <strong class="text-ink">jamais</strong> votre position GPS. Le nom de la ville que
          vous déclarez est converti en coordonnées approximatives à partir d'une base de villes
          <strong class="text-ink">embarquée</strong> (hors-ligne). On vous relie alors aux personnes dont la ville
          se trouve dans un rayon de <Mono>75 km</Mono>.
        </p>
        <ProximitySchema />
        <Example title="Exemple concret">
          Vous déclarez <Mono>Metz</Mono>. Une personne à <Mono>Nancy</Mono> (~50 km) vous est proposée&nbsp;; une
          personne à <Mono>Marseille</Mono> (~600 km), non. Le service ne sait pas <em>où</em> vous êtes dans la
          ville&nbsp;: il sait seulement que vous avez écrit «&nbsp;Metz&nbsp;».
        </Example>
      </Section>

      <!-- Trajet d'un message privé + DEMO 1 -->
      <Section eyebrow="Le cœur" title="Le voyage d'un message privé">
        <p>
          Quand vous envoyez un message privé, il suit trois étapes. La clé du système&nbsp;: le chiffrement et le
          déchiffrement ont lieu <strong class="text-ink">sur les appareils</strong>, jamais sur le serveur.
        </p>
        <ol class="my-6 flex flex-col gap-3">
          <Step n="01" title="Votre appareil chiffre">
            Le message est verrouillé avec une clé que seul votre interlocuteur peut utiliser pour l'ouvrir.
          </Step>
          <Step n="02" title="Le serveur relaie à l'aveugle">
            Il voit <em>à qui</em> et <em>de qui</em> transmettre (en clair, pour l'acheminement), mais le contenu
            lui-même n'est qu'un bloc illisible.
          </Step>
          <Step n="03" title="L'appareil du destinataire déchiffre">
            Lui seul possède la clé qui ouvre le message. Personne d'autre, pas même nous, ne le peut.
          </Step>
        </ol>

        <DemoCard
          title="Que voit le serveur ?"
          subtitle="Tapez un message : observez le clair, ce que le serveur relaie, et le déchiffré côté destinataire."
        >
          <ServerView v-if="ready && parties" :alice="parties.alice" :bob="parties.bob" />
          <DemoLoading v-else />
        </DemoCard>
      </Section>

      <!-- Chiffrement sans jargon -->
      <Section eyebrow="Chiffrement" title="Clés publique et privée, sans jargon">
        <p>
          D'habitude, une serrure a <strong class="text-ink">une seule clé</strong>&nbsp;: la même ferme et ouvre.
          Le chiffrement moderne utilise une idée plus maligne&nbsp;: <strong class="text-ink">deux clés
          différentes</strong>, fabriquées ensemble et liées mathématiquement. L'une <em>ferme</em> mais ne peut pas
          ouvrir&nbsp;; l'autre <em>ouvre</em> ce que la première a fermé.
        </p>
        <div class="mt-5 grid gap-3 sm:grid-cols-2">
          <Pillar
            icon="radar"
            title="La clé publique"
            text="Se donne à tout le monde. Elle ne sait que verrouiller — la connaître ne permet rien de plus."
          />
          <Pillar
            icon="lock"
            title="La clé privée"
            text="Reste secrète, sur votre appareil. Elle seule ouvre ce qui a été fermé pour vous."
          />
        </div>
        <p class="mt-5">
          Concrètement, une clé n'est pas un objet&nbsp;: c'est un <strong class="text-ink">grand nombre</strong>,
          une suite de caractères. À l'ouverture de votre session, votre navigateur en génère une paire au hasard. La
          clé publique (celle que vous avez vue plus haut dans le champ <Mono>env.pub</Mono>) est envoyée au serveur
          pour qu'on puisse vous écrire&nbsp;; la clé privée, elle,
          <strong class="text-ink">ne sort jamais de votre appareil</strong> — ni le serveur, ni personne ne la
          voit.
        </p>
        <KeySchema />

        <Example title="La subtilité : un secret que personne ne transmet">
          Proxima ne se contente pas de «&nbsp;fermer avec votre clé publique&nbsp;». Quand Alice vous écrit, son
          appareil combine <strong class="text-ink">sa clé privée</strong> avec <strong class="text-ink">votre
          clé publique</strong> pour calculer un <strong class="text-ink">secret commun</strong>. De votre côté,
          vous combinez votre clé privée avec la clé publique d'Alice et retrouvez
          <em>exactement le même secret</em> — sans qu'il n'ait jamais circulé. Bonus&nbsp;: comme la clé d'Alice entre
          dans le calcul, vous avez la <strong class="text-ink">preuve que le message vient bien d'elle</strong>.
        </Example>

        <CipherFlowSchema />

        <p class="mt-6">
          Sous le capot, Proxima s'appuie sur <Mono>libsodium</Mono>, une bibliothèque cryptographique éprouvée et
          largement auditée. Trois briques se partagent le travail&nbsp;:
        </p>
        <ul class="mt-4 flex flex-col gap-2.5">
          <Brick term="X25519">
            la façon dont les deux appareils calculent le <strong class="text-ink">secret commun</strong> à partir
            de leurs clés (l'«&nbsp;échange de clés&nbsp;»).
          </Brick>
          <Brick term="XSalsa20">
            l'algorithme qui <strong class="text-ink">brouille</strong> le message avec ce secret.
          </Brick>
          <Brick term="Poly1305">
            le <strong class="text-ink">sceau</strong> qui détecte toute altération&nbsp;: si un seul octet change,
            le déchiffrement <strong class="text-ink">échoue</strong> au lieu de produire un faux.
          </Brick>
        </ul>
      </Section>

      <!-- Empreinte / MITM + DEMO 3 -->
      <Section eyebrow="Confiance" title="Êtes-vous sûr·e de parler à la bonne personne ?">
        <p>
          Le seul risque résiduel d'un service anonyme&nbsp;: un relais malveillant qui se ferait passer pour votre
          interlocuteur (une attaque dite «&nbsp;de l'homme du milieu&nbsp;»). La parade&nbsp;: chaque conversation
          possède une <strong class="text-ink">empreinte de sécurité</strong>, calculée à partir des deux clés.
          Elle est <strong class="text-ink">identique des deux côtés</strong>… sauf si quelqu'un s'est intercalé.
          Comparez-la de vive voix&nbsp;: si elle diffère, méfiance.
        </p>
        <DemoCard
          title="Empreinte de sécurité"
          subtitle="Comparez les empreintes des deux interlocuteurs, puis activez un intercepteur et observez."
        >
          <FingerprintView v-if="ready && parties" :alice="parties.alice" :bob="parties.bob" :mitm="parties.mitm" />
          <DemoLoading v-else />
        </DemoCard>
      </Section>

      <!-- Padding + DEMO 2 -->
      <Section eyebrow="Discrétion" title="Même la longueur de vos messages reste secrète">
        <p>
          Un détail subtil&nbsp;: même chiffré, un message <em>long</em> produit un bloc <em>plus gros</em> qu'un
          message court. La taille pourrait donc trahir si vous répondez «&nbsp;oui&nbsp;» ou tout un paragraphe.
          Proxima <strong class="text-ink">rembourre</strong> chaque message à une taille fixe avant de le
          chiffrer&nbsp;: le serveur voit alors des blocs identiques.
        </p>
        <DemoCard
          title="La taille ne trahit rien"
          subtitle="Changez la longueur du message : la taille transmise reste la même."
        >
          <PaddingView v-if="ready && parties" :alice="parties.alice" :bob="parties.bob" />
          <DemoLoading v-else />
        </DemoCard>
      </Section>

      <!-- Salons -->
      <Section eyebrow="Salons" title="Discussions de groupe, publiques ou privées">
        <p>
          Vous pouvez créer ou rejoindre des salons, tous
          <strong class="text-ink">chiffrés de bout en bout</strong>. Les
          <strong class="text-ink">publics</strong> sont visibles de tous&nbsp;; les
          <strong class="text-ink">privés sur invitation</strong> s'ouvrent par lien&nbsp;; et les
          <strong class="text-ink">privés à mot de passe</strong>, par mot de passe. Le créateur en est propriétaire&nbsp;: il
          peut exclure un participant ou fermer le salon. S'il part, la propriété passe au plus ancien présent&nbsp;; et
          un salon vide est <strong class="text-ink">supprimé aussitôt</strong>.
        </p>
        <RoomsSchema />
        <p class="mt-3 text-[13.5px] text-muted">
          Tous les salons sont <strong class="text-ink">chiffrés</strong>&nbsp;: le serveur ne voit qu'une
          enveloppe opaque, comme pour les MP. Ce qui distingue les trois types, c'est la porte — donc la façon
          d'obtenir la clé. Dans un salon <strong class="text-ink">public</strong> ou
          <strong class="text-ink">sur invitation</strong>, quiconque entre la reçoit des membres déjà
          présents&nbsp;; dans un salon <strong class="text-ink">à mot de passe</strong>, elle se dérive du mot de
          passe, jamais transmis au serveur. Nuance importante&nbsp;: la confidentialité est «&nbsp;de
          groupe&nbsp;» (tout membre peut lire), <strong class="text-ink">sans authentification de
          l'auteur</strong> d'un message — le chiffrement met le contenu hors de portée de l'hébergeur, jamais des
          participants.
        </p>
      </Section>

      <!-- Ce que le serveur sait -->
      <Section eyebrow="Transparence" title="Ce que le serveur sait — et ignore">
        <div class="grid gap-4 sm:grid-cols-2">
          <KnowCard
            tone="bad"
            title="Ne peut pas voir"
            :items="[
              'Le contenu de vos messages privés',
              'Le contenu des salons (tous chiffrés)',
              'Votre vraie identité (aucune PII)',
              'Votre position GPS',
              `La longueur de vos MP (rembourrage)`,
              `Quoi que ce soit après la fermeture de l'onglet`,
            ]"
          />
          <KnowCard
            tone="ok"
            title="Voit, temporairement"
            :items="[
              'Le pseudo, l’âge et la ville déclarés',
              'Qui est en ligne, et à proximité de qui',
              'Des blocs chiffrés pour les MP et les salons (à relayer)',
              'Un hash salé éphémère de l’IP (anti-spam)',
            ]"
          />
        </div>
        <p class="mt-4 text-[13px] leading-relaxed text-faint">
          L'adresse IP n'est jamais journalisée en clair&nbsp;: lorsqu'elle est nécessaire (limiter le spam), seule une
          empreinte salée, à durée de vie de quelques minutes et au sel rotatif, est conservée.
        </p>
      </Section>

      <!-- Code source — placé JUSTE APRÈS le tableau de ce que le serveur voit et
          ne voit pas. C'est le moment exact où un lecteur attentif se demande
          « qui me dit que c'est vrai ? » : la réponse doit arriver là, pas trois
          écrans plus bas. Toute la page n'est qu'une suite d'affirmations tant
          qu'on ne peut pas les recouper. -->
      <Section eyebrow="Vérifiabilité" title="Ne nous croyez pas sur parole">
        <p>
          Tout ce que vous venez de lire est une <strong class="text-ink">affirmation</strong>. N'importe quel
          service peut écrire qu'il ne lit pas vos messages&nbsp;; rien, dans une jolie page, ne le prouve. Le code de
          Proxima est donc <strong class="text-ink">public et lisible par n'importe qui</strong> — y compris par
          des gens qui n'ont aucune raison de nous ménager.
        </p>
        <p class="mt-3">Les promesses de cette page se vérifient là&nbsp;:</p>
        <ul class="mt-4 flex flex-col gap-2.5">
          <Brick term="lib/crypto.ts">
            Le chiffrement, côté navigateur&nbsp;: la clé privée y est fabriquée et n'en sort jamais.
          </Brick>
          <Brick term="server/security.js">
            Le traitement de l'adresse IP&nbsp;: le hachage salé, la rotation du sel, et l'absence de journalisation.
          </Brick>
          <Brick term="domain/sessions.js">
            La durée de vie d'une identité&nbsp;: les délais d'expiration, et ce qui est détruit à la déconnexion.
          </Brick>
          <Brick term="handlers/messages.js">
            Le relais des salons chiffrés&nbsp;: on y voit que rien n'analyse le contenu qui passe.
          </Brick>
        </ul>
        <Example title="Pourquoi la licence compte">
          Proxima est publié sous <strong>AGPL-3.0</strong>. Cette licence oblige quiconque héberge une version
          modifiée du service à en publier le code. Personne ne peut donc faire tourner un « Proxima » auquel on
          aurait discrètement ajouté un enregistrement des messages ou des adresses IP, sans que la modification soit
          visible de tous.
        </Example>
        <p class="mt-5">
          <a class="source-link" :href="SOURCE_URL" target="_blank" rel="noopener noreferrer">
            <GitHubGlyph :size="15" />
            Lire le code source
            <span class="source-link__licence">AGPL-3.0</span>
          </a>
        </p>
      </Section>

      <!-- Modération & cadre légal -->
      <Section eyebrow="Cadre légal" title="Modération, signalement et vos droits">
        <p>
          Proxima est anonyme, mais pas <strong class="text-ink">ingouvernable</strong>. Chaque message peut être
          <strong class="text-ink">signalé</strong> à la modération depuis le service. La modération est
          réactive&nbsp;: elle ne surveille pas vos échanges — tout étant chiffré, elle ne le pourrait pas — mais agit
          sur signalement (retrait ciblé d'un message signalé, exclusion d'un participant, fermeture de salon). Vos
          messages privés <strong class="text-ink">comme vos salons</strong> restent
          <strong class="text-ink">illisibles</strong> pour nous&nbsp;: un contenu n'est signalé que via le texte
          que le signaleur fournit lui-même.
        </p>
        <div class="mt-5 flex flex-wrap gap-2">
          <a href="/cgu" class="chip chip-blue cursor-pointer">
            Conditions d'utilisation
          </a>
          <a href="/confidentialite" class="chip chip-blue cursor-pointer">
            Confidentialité (RGPD)
          </a>
          <a href="/moderation" class="chip chip-blue cursor-pointer">
            Politique de modération
          </a>
          <a href="/mentions-legales" class="chip chip-blue cursor-pointer">
            Mentions légales
          </a>
        </div>
        <p v-if="legal?.contactEmail" class="mt-4 text-[13.5px] text-muted">
          Point de contact (autorités, demandes légales)&nbsp;: <Mono>{{ legal.contactEmail }}</Mono>.
        </p>

        <!-- Accès Tor — l'endroit où un lecteur curieux cherchera l'information.
            On explique CE QUE ÇA CHANGE avant de donner l'adresse : sans cette
            phrase, 62 caractères illisibles ne veulent rien dire. Masqué quand on
            y est déjà, et jamais transformé en lien (cf. SiteFooter.vue). -->
        <p v-if="legal?.onionHost && !isOnionOrigin()" class="mt-4 text-[13.5px] text-muted">
          <strong class="text-ink">Accès par Tor.</strong> Proxima est aussi joignable en service onion. Par
          cette porte, votre adresse IP <strong class="text-ink">n'atteint jamais nos serveurs</strong>&nbsp;:
          nous ne voyons qu'un circuit Tor. Adresse (à ouvrir dans Tor Browser)&nbsp;:
          <Mono>{{ legal.onionHost }}</Mono>
        </p>
      </Section>

      <!-- Limites -->
      <Section eyebrow="Honnêteté" title="Nos limites, assumées">
        <p>La confiance passe aussi par la transparence sur ce que nous ne garantissons pas&nbsp;:</p>
        <ul class="mt-4 flex flex-col gap-2.5">
          <Limit>
            La <strong class="text-ink">majorité (18+)</strong> est déclarative&nbsp;: elle n'est pas vérifiée.
          </Limit>
          <Limit>
            La <strong class="text-ink">modération</strong> est réactive (sur signalement), sans surveillance
            automatique généralisée&nbsp;; une exclusion reste <strong class="text-ink">contournable</strong> (du
            fait de l'anonymat).
          </Limit>
          <Limit>
            En accès ordinaire, l'<strong class="text-ink">hébergeur voit votre IP</strong> (comme pour tout site
            web)&nbsp;; nous n'en gardons qu'une empreinte salée et éphémère, jamais l'adresse. Pour qu'elle ne nous
            parvienne pas du tout, il existe désormais un <strong class="text-ink">accès Tor</strong> (voir plus
            haut) — mais il reste minoritaire, et cette limite vaut pour la plupart des visites.
          </Limit>
          <Limit>
            Le chiffrement des salons est <strong class="text-ink">de groupe</strong>&nbsp;: il met le contenu
            hors de portée de l'hébergeur, jamais des participants — quiconque franchit la porte obtient la clé. Et
            il se fait sans <strong class="text-ink">authentification de l'auteur</strong> d'un message (un
            membre pourrait en usurper un autre).
          </Limit>
        </ul>
      </Section>

      <!-- CTA -->
      <div class="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-line bg-card p-8 text-center">
        <Logo className="h-12 w-12" />
        <h2 class="font-display text-2xl font-semibold">Prêt·e à essayer ?</h2>
        <p class="max-w-md text-sm text-muted">
          Vous savez désormais ce qui se passe sous le capot. Le reste se vit en discutant.
        </p>
        <!-- Le Discord reste secondaire : la page se termine sur l'entrée dans le service. -->
        <div class="flex flex-wrap items-center justify-center gap-3">
          <button class="btn btn-primary" @click="closePage">
            <Icon name="arrowRight" :size="16" /> Revenir au service
          </button>
          <a v-if="DISCORD_INVITE" class="btn btn-discord" :href="DISCORD_INVITE" target="_blank" rel="noopener noreferrer">
            <DiscordGlyph :size="17" /> Rejoindre le Discord
          </a>
        </div>
      </div>
    </article>

    <SiteFooter />
  </div>
</template>
