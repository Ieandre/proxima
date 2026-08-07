<script setup lang="ts">
import { useStore } from '../../store/useStore';
import NetworkBackground from '../NetworkBackground.vue';
import { Icon, Logo } from '../ui';

const st = useStore();
</script>

<template>
  <div class="relative grid h-full place-items-center overflow-hidden p-8 text-center">
    <!-- Fond vivant : réseau de nœuds reliés qui suit le curseur (réutilisé de l'onboarding). -->
    <NetworkBackground />

    <div class="fade-up relative z-10 max-w-md">
      <Logo className="mx-auto mb-6 h-16 w-16" />
      <h2 class="font-display text-2xl font-semibold tracking-tight">
        {{ st.me ? `Bonjour, ${st.me.pseudo}` : 'Bienvenue dans Proxima' }}
      </h2>
      <p class="mx-auto mt-2.5 max-w-sm text-[15px] leading-relaxed text-muted">
        <template v-if="st.me?.city">
          Vous êtes connecté·e depuis <strong class="text-ink">{{ st.me.city }}</strong>. Les salons et les personnes
          à portée sont ceux d'un rayon de {{ st.radiusKm }} km.
        </template>
        <template v-else>Choisissez un salon ou une personne à portée pour commencer à écrire.</template>
      </p>

      <button class="btn btn-primary mt-7" @click="st.setRoomBrowser(true)">
        <Icon name="plus" :size="16" />
        Créer un salon
      </button>
      <p class="mx-auto mt-4 max-w-xs text-[12.5px] leading-relaxed text-faint">
        À gauche, les salons ouverts autour de vous et les personnes à portée. Cliquez un salon pour voir ce qu'il
        est avant d'y entrer.
      </p>
    </div>
  </div>
</template>
