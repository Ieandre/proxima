<script setup lang="ts">
import { Icon } from '../ui';

defineProps<{
  icon: string;
  title: string;
  /* Omis plutôt que 0 quand la section n'a rien à dénombrer : « Conversations
     privées 0 » compterait une absence, là où « À proximité 0 » constate un vide
     réel autour de soi. */
  count?: number;
}>();
</script>

<template>
  <div class="mb-2 mt-1 flex items-center gap-2 px-1">
    <span class="text-faint">
      <Icon :name="icon" :size="14" />
    </span>
    <span class="text-[12px] font-semibold text-muted">{{ title }}</span>
    <span v-if="count !== undefined" class="text-[11px] tabular-nums text-faint">{{ count }}</span>
    <span class="ml-auto"><slot name="action" /></span>
  </div>
</template>
