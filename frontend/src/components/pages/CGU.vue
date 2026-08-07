<script setup lang="ts">
import { Icon } from '../ui';
</script>

<template>
  <section class="py-10">
    <h1
      class="font-display text-[clamp(1.7rem,4vw,2.6rem)] font-semibold leading-tight tracking-tight"
      style="text-wrap: balance"
    >
      Conditions générales d'utilisation
    </h1>
    <div class="mt-5 text-[15px] leading-relaxed text-muted [&_strong]:font-semibold [&_strong]:text-ink">
      <p class="mt-3">
        Les présentes conditions régissent l'accès et l'usage de Proxima (le «&nbsp;Service&nbsp;»), une messagerie
        anonyme de proximité, sans compte et éphémère. En accédant au Service, vous reconnaissez les avoir lues et
        acceptées, ainsi que la <a href="/moderation" class="font-medium text-blue underline-offset-2 hover:underline">Politique de modération</a> et la
        <a href="/confidentialite" class="font-medium text-blue underline-offset-2 hover:underline">Politique de confidentialité</a>.
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">1. Objet du service</h2>
      <p class="mt-3">
        Le Service permet d'échanger en temps réel, en messages privés ou dans des salons thématiques — les uns comme
        les autres chiffrés de bout en bout —, avec des personnes situées dans une même zone géographique déclarée. Aucune inscription n'est
        requise&nbsp;; l'identité de session (pseudo, âge, ville) est volatile et détruite à la fermeture de l'onglet.
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">2. Accès et public</h2>
      <ul class="mt-3 flex flex-col gap-2">
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>L'accès est strictement réservé aux personnes âgées de <strong>18 ans ou plus</strong>.</span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>La majorité est déclarative&nbsp;; aucune vérification d'identité n'est effectuée (voir limites).</span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>Le Service est destiné à un usage personnel et licite.</span>
        </li>
      </ul>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">3. Comportements et contenus interdits</h2>
      <p class="mt-3">Il est notamment interdit de diffuser, via les salons ou les messages privés&nbsp;:</p>
      <ul class="mt-3 flex flex-col gap-2">
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>tout contenu manifestement illégal au regard du droit applicable ;</span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>tout contenu relatif à la mise en danger ou à l'exploitation de mineurs ;</span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>des propos haineux, discriminatoires, ou constitutifs de harcèlement ou de menaces ;</span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>l'usurpation d'identité, l'atteinte à la vie privée ou aux données d'autrui ;</span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>du spam, des contenus publicitaires non sollicités ou des tentatives d'hameçonnage ;</span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>tout contenu portant atteinte aux droits de propriété intellectuelle de tiers.</span>
        </li>
      </ul>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">4. Chiffrement et responsabilité du contenu</h2>
      <p class="mt-3">
        Les messages privés et les salons sont chiffrés de bout en bout&nbsp;: l'éditeur ne peut pas en prendre
        connaissance. Vous
        demeurez seul·e responsable des contenus que vous publiez ou transmettez. L'éditeur agit en qualité
        d'hébergeur de contenus tiers et n'exerce aucune surveillance généralisée (DSA art.&nbsp;8).
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">5. Modération et sanctions</h2>
      <p class="mt-3">
        Tout contenu peut être signalé depuis le Service. En cas de manquement, l'éditeur ou le propriétaire d'un salon
        peut retirer un message, exclure un participant, fermer un salon ou restreindre l'accès (mesure best-effort,
        contournable du fait de l'anonymat). Les modalités figurent dans la <a href="/moderation" class="font-medium text-blue underline-offset-2 hover:underline">Politique de
        modération</a>.
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">6. Disponibilité et responsabilité</h2>
      <p class="mt-3">
        Le Service est fourni «&nbsp;en l'état&nbsp;», sans garantie de disponibilité ni d'absence d'interruption.
        Dans les limites permises par la loi, l'éditeur ne saurait être tenu responsable des contenus publiés par les
        utilisateurs ni des dommages indirects résultant de l'usage du Service.
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">7. Droit applicable</h2>
      <p class="mt-3">
        Les présentes conditions sont régies par le droit français. Tout litige relève de la compétence des
        juridictions françaises, sous réserve des dispositions protectrices applicables aux consommateurs. L'éditeur
        peut modifier les présentes conditions&nbsp;; la version en vigueur est celle publiée sur cette page.
      </p>
    </div>
  </section>
</template>
