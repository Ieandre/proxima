<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import Icon from './Icon.vue';

const props = defineProps<{ title: string; onClose: () => void }>();

const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div
    class="fixed inset-0 z-50 grid place-items-center p-4"
    :style="{ background: 'rgba(3,6,8,0.72)', backdropFilter: 'blur(6px)' }"
    @mousedown="onClose"
  >
    <div class="panel fade-up w-full max-w-md p-5" role="dialog" aria-modal="true" @mousedown.stop>
      <div class="mb-4 flex items-center justify-between">
        <h2 class="font-display text-lg font-semibold tracking-tight">{{ title }}</h2>
        <button class="text-faint hover:text-ink transition-colors" aria-label="Fermer" @click="onClose">
          <Icon name="close" />
        </button>
      </div>
      <slot />
    </div>
  </div>
</template>
