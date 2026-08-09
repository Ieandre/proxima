<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { formatDuration, spokenDuration } from '../../lib/voice';
import Icon from './Icon.vue';
import Waveform from './Waveform.vue';

/**
 * Lecture d'un message vocal — le même objet avant l'envoi et une fois sur le fil.
 * Un seul composant pour les deux : ce qu'on écoute dans l'aperçu doit être, au
 * pixel près, ce que le destinataire verra.
 */
const props = defineProps<{
  url: string;
  /**
   * Durée mesurée à la capture (cf. `lib/voice.ts`). C'est ELLE qui fait foi, et
   * pas `audio.duration` : un conteneur sorti de `MediaRecorder` n'annonce pas sa
   * durée tant qu'il n'a pas été lu en entier, et vaut `Infinity` d'ici là.
   */
  seconds: number;
  peaks?: Uint8Array | null;
}>();

const audio = ref<HTMLAudioElement | null>(null);
const playing = ref(false);
const at = ref(0);
/** Repli quand la durée n'a pas voyagé : ce que le lecteur finit par annoncer lui-même. */
const measured = ref(0);

const total = computed(() => (props.seconds > 0 ? props.seconds : measured.value));
const progress = computed(() => (total.value ? Math.min(1, at.value / total.value) : 0));
// Le temps écoulé pendant l'écoute, la durée totale au repos : les deux fois, le
// chiffre qu'on cherche.
const shown = computed(() => formatDuration(playing.value || at.value > 0 ? at.value : total.value));

function toggle() {
  const el = audio.value;
  if (!el) return;
  if (el.paused) void el.play().catch(() => {});
  else el.pause();
}

function onLoaded() {
  const d = audio.value?.duration;
  if (d && Number.isFinite(d)) measured.value = d;
}

function moveTo(seconds: number) {
  const el = audio.value;
  if (!el || !total.value) return;
  const next = Math.min(total.value, Math.max(0, seconds));
  el.currentTime = next;
  at.value = next;
}

/** Viser un instant dans la silhouette : la forme sert de règle. */
function seek(e: MouseEvent) {
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
  if (!box.width) return;
  moveTo(((e.clientX - box.left) / box.width) * total.value);
}

// Au clavier, on avance par pas de cinq secondes depuis le bouton de lecture :
// pointer une position dans une forme demande une souris, se déplacer dedans non.
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') moveTo(at.value + 5);
  else if (e.key === 'ArrowLeft') moveTo(at.value - 5);
  else return;
  e.preventDefault();
}

onUnmounted(() => audio.value?.pause());
</script>

<template>
  <div class="voice" role="group" :aria-label="`Message vocal, ${spokenDuration(total)}`">
    <audio
      ref="audio"
      :src="url"
      preload="metadata"
      @loadedmetadata="onLoaded"
      @durationchange="onLoaded"
      @timeupdate="at = audio?.currentTime ?? 0"
      @play="playing = true"
      @pause="playing = false"
      @ended="
        playing = false;
        at = 0;
      "
    />
    <button
      type="button"
      class="voice__play"
      :aria-label="playing ? 'Mettre en pause' : 'Écouter le message vocal'"
      :title="playing ? 'Pause' : 'Écouter'"
      @click="toggle"
      @keydown="onKey"
    >
      <Icon :name="playing ? 'pause' : 'play'" :size="15" />
    </button>
    <div class="voice__wave" @click="seek">
      <Waveform :peaks="peaks" :progress="progress" />
    </div>
    <span class="voice__time">{{ shown }}</span>
  </div>
</template>
