<script setup lang="ts">
import { Icon } from '../ui';

defineProps<{ contact: string }>();
</script>

<template>
  <section class="py-10">
    <h1
      class="font-display text-[clamp(1.7rem,4vw,2.6rem)] font-semibold leading-tight tracking-tight"
      style="text-wrap: balance"
    >
      Politique de modération
    </h1>
    <div class="mt-5 text-[15px] leading-relaxed text-muted [&_strong]:font-semibold [&_strong]:text-ink">
      <p class="mt-3">
        Proxima est anonyme, mais <strong>pas ingouvernable</strong>. La modération est <strong>réactive</strong> (mécanisme de
        signalement, dit «&nbsp;notice-and-action&nbsp;», DSA art.&nbsp;16) et ne repose sur <strong>aucune surveillance
        généralisée</strong> (DSA art.&nbsp;8).
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">1. Signaler un contenu</h2>
      <p class="mt-3">
        Chaque message peut être signalé via le bouton «&nbsp;signaler&nbsp;». Les motifs proposés sont&nbsp;: contenu
        illégal, mineur en danger (traité en priorité), harcèlement, spam, ou autre.
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">2. Salons</h2>
      <p class="mt-3">
        Tous les salons sont chiffrés de bout en bout&nbsp;: le Service n'en voit passer que des enveloppes opaques et
        n'exerce <strong>aucun filtrage automatique</strong> du contenu. La modération repose intégralement sur le
        signalement&nbsp;— tout membre d'un salon peut lire ce qui s'y dit, et donc fournir le texte qu'il signale.
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">3. Contenus chiffrés et signalement</h2>
      <p class="mt-3">
        Le Service <strong>ne peut lire</strong> ni les messages privés ni les salons. Lorsqu'un message est signalé, c'est le
        texte <strong>déchiffré sur votre appareil</strong> qui est transmis à la modération&nbsp;: son authenticité ne peut donc
        pas être vérifiée côté serveur. La modération peut alors agir sur la session de l'auteur présumé et demander le
        retrait d'un message de salon, ciblé par son identifiant&nbsp;; un message privé, lui, ne peut pas être
        «&nbsp;retiré&nbsp;».
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">4. Mesures possibles</h2>
      <ul class="mt-3 flex flex-col gap-2">
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>Retrait d'un message de salon, ciblé par son identifiant (effacement best-effort chez les participants connectés) ;</span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>Exclusion d'un participant d'un salon ;</span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>Restriction d'accès best-effort — contournable, l'anonymat n'autorisant aucun identifiant durable ;</span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>Fermeture d'un salon.</span>
        </li>
      </ul>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">5. Rôles</h2>
      <p class="mt-3">
        Le <strong>propriétaire d'un salon</strong> est le modérateur de première ligne&nbsp;: il peut exclure un participant ou
        fermer son salon. L'<strong>opérateur</strong> du Service intervient en escalade, notamment pour les contenus illégaux.
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">6. Délais et priorités</h2>
      <p class="mt-3">
        Les signalements sont traités dans un délai raisonnable. Les contenus relatifs à des mineurs en danger ou
        manifestement illégaux sont traités en priorité. Les signalements sont conservés de 24 à 72&nbsp;heures, sans
        adresse IP, le temps de leur traitement.
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">7. Réquisitions légales</h2>
      <p class="mt-3">
        Conformément au cadre applicable, l'éditeur ne conserve pas de journaux rétroactifs&nbsp;; il ne peut répondre
        qu'à une demande de <strong>préservation prospective</strong>, à compter de sa réception.
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">8. Point de contact</h2>
      <p class="mt-3">
        Pour signaler un contenu hors application, ou pour toute demande d'autorité&nbsp;: <a v-if="contact" :href="`mailto:${contact}`" class="font-medium text-blue underline-offset-2 hover:underline">{{ contact }}</a><span v-else class="rounded bg-[var(--color-danger-tint)] px-1.5 py-0.5 font-mono text-[0.8em] text-danger">[À COMPLÉTER : adresse de contact à configurer]</span>.
      </p>
    </div>
  </section>
</template>
