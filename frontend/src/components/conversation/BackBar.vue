<script setup lang="ts">
import { useStore } from '../../store/useStore';
import { Icon } from '../ui';

const st = useStore();
</script>

<template>
  <div class="flex items-center gap-3 border-b border-line bg-card px-3 py-2.5 sm:px-4">
    <button class="btn btn-ghost px-2.5 md:hidden" aria-label="Retour" @click="st.setActive(null)">
      <Icon name="back" :size="16" />
    </button>
    <slot />
  </div>
</template>
