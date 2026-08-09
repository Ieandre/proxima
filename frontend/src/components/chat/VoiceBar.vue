<script setup lang="ts">
import { formatDuration, type VoiceTake } from '../../lib/voice';
import type { VoiceState } from '../../composables/voice';
import { Icon, VoicePlayer, Waveform } from '../ui';

/**
 * Bandeau de prise de son, au-dessus du champ de saisie — la place qu'occupent
 * déjà la citation, la retouche et le collage. La capture est rouge, l'écoute
 * bleue : ce basculement de couleur est ce qui dit que la prise est terminée et
 * qu'elle n'appartient encore qu'à soi.
 */
defineProps<{
  state: VoiceState;
  livePeaks: number[];
  seconds: number;
  take: VoiceTake | null;
  previewUrl: string;
  onFinish: () => void;
  onDiscard: () => void;
}>();
</script>

<template>
  <!-- Capture. Le point qui bat, la forme qui défile et le compteur disent trois
       fois la même chose ; un libellé de plus serait un mot de trop, d'où le
       relais discret pour les lecteurs d'écran. -->
  <div v-if="state === 'recording'" class="reply-bar reply-bar--rec fade-up" role="status">
    <span class="rec-dot" aria-hidden="true" />
    <span class="sr-only">Enregistrement en cours</span>
    <Waveform :peaks="livePeaks" live />
    <span class="voice__time">{{ formatDuration(seconds) }}</span>
    <button type="button" class="btn btn-primary h-9 px-3 text-[13px]" @click="onFinish">Terminer</button>
    <button
      type="button"
      class="reply-bar__close"
      @click="onDiscard"
      aria-label="Annuler l'enregistrement"
      title="Annuler l'enregistrement"
    >
      <Icon name="close" :size="14" />
    </button>
  </div>

  <!-- Écoute avant envoi : on s'entend toujours avant les autres. -->
  <div v-else-if="state === 'ready'" class="reply-bar reply-bar--voice fade-up">
    <div class="reply-bar__body">
      <VoicePlayer :url="previewUrl" :seconds="seconds" :peaks="take?.peaks" />
      <div class="reply-bar__text mt-1">Entrée pour envoyer, Échap pour retirer.</div>
    </div>
    <button
      type="button"
      class="reply-bar__close"
      @click="onDiscard"
      aria-label="Retirer le message vocal"
      title="Retirer le message vocal"
    >
      <Icon name="close" :size="14" />
    </button>
  </div>
</template>
