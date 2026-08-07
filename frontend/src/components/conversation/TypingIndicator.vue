<script setup lang="ts">
/* ---- Panneau des membres (style IRC) ----------------------------------- */

import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useStore } from '../../store/useStore';

const props = defineProps<{ convKey: string }>();
const st = useStore();

const tick = ref(0);
let timer = 0;
onMounted(() => {
  timer = window.setInterval(() => {
    tick.value += 1;
  }, 1000);
});
onUnmounted(() => window.clearInterval(timer));

const names = computed(() => {
  // L'horloge force le recalcul chaque seconde : les entrées expirent par `until`,
  // sans nouvel événement réseau.
  void tick.value;
  const typing = st.typing[props.convKey];
  const now = Date.now();
  return typing ? Object.values(typing).filter((v) => v.until > now).map((v) => v.pseudo) : [];
});

const label = computed(() =>
  names.value.length === 1
    ? `${names.value[0]} est en train d'écrire`
    : names.value.length === 2
      ? `${names.value[0]} et ${names.value[1]} sont en train d'écrire`
      : 'Plusieurs personnes écrivent',
);
</script>

<template>
  <div v-if="names.length > 0" class="flex items-center gap-2 px-4 py-1.5 text-[12px] text-muted">
    <span class="typing-dots" aria-hidden="true"><span>•</span><span>•</span><span>•</span></span>
    {{ label }}…
  </div>
</template>
