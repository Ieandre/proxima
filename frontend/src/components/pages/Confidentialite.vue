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
      Politique de confidentialité
    </h1>
    <div class="mt-5 text-[15px] leading-relaxed text-muted [&_strong]:font-semibold [&_strong]:text-ink">
      <p class="mt-3">
        Proxima est conçu selon le principe de <strong>protection des données dès la conception</strong> (privacy by design) et
        de minimisation. Cette politique décrit les traitements réalisés, conformément au RGPD (Règlement UE 2016/679).
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">1. Responsable du traitement</h2>
      <p class="mt-3">
        Le responsable du traitement est l'éditeur du Service (voir <a href="/mentions-legales" class="font-medium text-blue underline-offset-2 hover:underline">Mentions légales</a>).
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">2. Données traitées</h2>
      <ul class="mt-3 flex flex-col gap-2">
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>
            <strong>Identité de session déclarative</strong> (pseudo, âge, genre, ville)&nbsp;: stockée uniquement en mémoire
            vive, avec une durée de vie courte prolongée par l'activité, et détruite à la fermeture de l'onglet.
          </span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>
            <strong>Contenu des messages privés et des salons</strong>&nbsp;: chiffré de bout en bout&nbsp;; l'éditeur ne relaie
            que des enveloppes opaques, n'y a jamais accès et ne le conserve pas.
          </span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>
            <strong>Donnée technique anti-abus</strong>&nbsp;: une empreinte salée et éphémère de l'adresse IP (sel rotatif, durée
            de vie de quelques minutes). L'adresse IP n'est <strong>jamais</strong> journalisée en clair.
          </span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>
            <strong>Signalements</strong>&nbsp;: en cas de signalement, une copie du contenu signalé, du pseudo et de
            l'horodatage est conservée temporairement (24 à 72&nbsp;h) pour traitement, <strong>sans adresse IP</strong>, puis
            purgée automatiquement.
          </span>
        </li>
      </ul>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">3. Finalités et bases légales</h2>
      <ul class="mt-3 flex flex-col gap-2">
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>Fournir le service de messagerie temps réel — exécution du service demandé ;</span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>Assurer la sécurité, prévenir le spam et les abus — intérêt légitime de l'éditeur et des utilisateurs ;</span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1 flex-none text-blue"><Icon name="shield" :size="13" /></span>
          <span>Traiter les signalements et retirer les contenus illicites — obligation légale (DSA) et intérêt légitime.</span>
        </li>
      </ul>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">4. Durées de conservation</h2>
      <p class="mt-3">
        Tout est volatil&nbsp;: l'identité de session et le contenu disparaissent à la fermeture de l'onglet. Les
        signalements sont conservés de 24 à 72&nbsp;heures, les éventuels incidents de réquisition au maximum
        72&nbsp;heures. Aucune donnée de contenu ou d'identité n'est écrite sur disque.
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">5. Cookies et traceurs</h2>
      <p class="mt-3">
        Le Service n'utilise <strong>aucun traceur publicitaire ni analytique tiers</strong>. Seul un jeton de session technique,
        nécessaire au fonctionnement, est utilisé.
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">6. Destinataires et transferts</h2>
      <p class="mt-3">
        Aucune donnée n'est communiquée à des tiers à des fins commerciales, ni transférée hors de l'Union européenne.
        En cas de réquisition légale, l'éditeur ne peut fournir qu'une <strong>préservation prospective</strong> (à compter de la
        demande)&nbsp;: aucune donnée rétroactive n'existe.
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">7. Vos droits</h2>
      <p class="mt-3">
        Vous disposez des droits d'accès, de rectification, d'effacement, de limitation et d'opposition. Compte tenu de
        l'anonymat et de l'absence de compte, l'éditeur n'est généralement pas en mesure de vous ré-identifier&nbsp;;
        par ailleurs vos données sont de toute façon effacées à la fermeture de l'onglet. Pour toute demande&nbsp;:
        <a v-if="contact" :href="`mailto:${contact}`" class="font-medium text-blue underline-offset-2 hover:underline">{{ contact }}</a><span v-else class="rounded bg-[var(--color-danger-tint)] px-1.5 py-0.5 font-mono text-[0.8em] text-danger">[À COMPLÉTER : adresse de contact à configurer]</span>. Vous pouvez introduire une réclamation auprès de l'autorité de contrôle compétente
        (en France, la <strong>CNIL</strong>).
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">8. Mineurs</h2>
      <p class="mt-3">Le Service est réservé aux personnes majeures&nbsp;; aucun traitement de données de mineurs n'est recherché.</p>
    </div>
  </section>
</template>
