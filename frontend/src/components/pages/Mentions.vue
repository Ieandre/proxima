<script setup lang="ts">
defineProps<{ contact: string; updated: string }>();
</script>

<template>
  <section class="py-10">
    <h1
      class="font-display text-[clamp(1.7rem,4vw,2.6rem)] font-semibold leading-tight tracking-tight"
      style="text-wrap: balance"
    >
      Mentions légales
    </h1>
    <div class="mt-5 text-[15px] leading-relaxed text-muted [&_strong]:font-semibold [&_strong]:text-ink">
      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">Éditeur du service</h2>
      <p class="mt-3">
        <strong>Proxima Chat SAS</strong>, société par actions simplifiée au capital de 1&nbsp;000&nbsp;€, dont le siège social
        est situé 12 rue de la Paix, 75002 Paris, France, immatriculée au RCS de Paris sous le numéro
        912&nbsp;345&nbsp;678. Directeur de la publication&nbsp;: Camille Durand.
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">Hébergeur</h2>
      <p class="mt-3">
        <strong>Oracle France SAS</strong>, 15 boulevard Charles de Gaulle, 92700 Colombes, France — infrastructure Oracle Cloud
        (OCI), région de Paris (eu-paris-1). Contact&nbsp;: +33&nbsp;(0)1&nbsp;57&nbsp;60&nbsp;20&nbsp;20. À
        noter&nbsp;: comme tout site web, l'hébergeur a techniquement connaissance de l'adresse IP des visiteurs.
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">Point de contact (DSA art. 11-12)</h2>
      <p class="mt-3">
        Point de contact unique pour les autorités et les utilisateurs, dans une langue de l'Union&nbsp;:
        <a v-if="contact" :href="`mailto:${contact}`" class="font-medium text-blue underline-offset-2 hover:underline">{{ contact }}</a><span v-else class="rounded bg-[var(--color-danger-tint)] px-1.5 py-0.5 font-mono text-[0.8em] text-danger">[À COMPLÉTER : adresse de contact à configurer]</span>.
      </p>

      <!-- Attribution exigée par les licences des deux jeux de données embarqués : sans
          elle, l'usage de la base des communes n'est pas conforme. -->
      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">Données géographiques</h2>
      <p class="mt-3">
        La commune déclarée est convertie en coordonnées par une base embarquée, hors&#8209;ligne&nbsp;: aucune
        géolocalisation réelle n'est demandée ni relevée. Communes françaises et codes postaux&nbsp;:
        <strong>© INSEE / Etalab</strong> (API Découpage administratif, Licence Ouverte&nbsp;2.0). Communes de Belgique, Suisse,
        Luxembourg et Monaco&nbsp;: <strong>© GeoNames</strong> (CC&nbsp;BY&nbsp;4.0).
      </p>

      <h2 class="mb-2 mt-8 font-display text-[1.15rem] font-semibold tracking-tight text-ink">Documents liés</h2>
      <p class="mt-3">
        <a href="/cgu" class="font-medium text-blue underline-offset-2 hover:underline">Conditions d'utilisation</a> · <a href="/confidentialite" class="font-medium text-blue underline-offset-2 hover:underline">Politique de confidentialité</a> ·
        <a href="/moderation" class="font-medium text-blue underline-offset-2 hover:underline">Politique de modération</a>.
      </p>

      <p class="mt-3 mt-6 text-[13px] text-faint">Dernière mise à jour&nbsp;: {{ updated }}.</p>
    </div>
  </section>
</template>
