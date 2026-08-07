<script setup lang="ts">
import { GENDER_LABEL, type Person } from '../../lib/types';
import { Avatar } from '../ui';
import UnreadBadge from './UnreadBadge.vue';

defineProps<{
  p: Person;
  active: boolean;
  unread: number;
  offRadar?: boolean;
  onClick: () => void;
}>();
</script>

<template>
  <button
    :class="`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors ${
      active ? 'border-[var(--color-blue)] bg-blue-tint' : 'border-transparent hover:bg-card'
    }`"
    @click="onClick"
  >
    <Avatar :id="p.id" :pseudo="p.pseudo" :size="34" />
    <span class="min-w-0 flex-1">
      <span class="flex items-center gap-1.5">
        <span class="truncate text-sm font-semibold">{{ p.pseudo }}</span>
        <span
          v-if="!offRadar"
          class="flex-none rounded px-1 text-[9.5px] font-semibold uppercase leading-tight"
          :style="{ border: '1px solid var(--color-line-strong)', color: 'var(--color-muted)' }"
          :title="GENDER_LABEL[p.gender]"
        >{{ p.gender }}</span>
      </span>
      <span class="text-[11px] text-faint">
        {{ offRadar || !p.city ? 'hors de portée' : `${p.city} · ${p.age} ans` }}
      </span>
    </span>
    <UnreadBadge :n="unread" />
  </button>
</template>
