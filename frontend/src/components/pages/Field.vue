<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '../ui';

const props = withDefaults(defineProps<{ name: string; value: string; hint: string; secret?: boolean }>(), {
  secret: false,
});

const tone = computed(() => (props.secret ? 'var(--color-verified)' : 'var(--color-danger)'));
const tint = computed(() => (props.secret ? 'var(--color-verified-tint)' : 'var(--color-danger-tint)'));
</script>

<template>
  <div class="bg-card px-3 py-2">
    <div class="flex items-center justify-between gap-2">
      <code class="font-mono text-[11px] font-semibold text-ink">{{ name }}</code>
      <span
        class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
        :style="{ color: tone, background: tint }"
      >
        <Icon :name="secret ? 'lock' : 'radar'" :size="9" />
        {{ secret ? 'chiffré · illisible' : 'lu en clair' }}
      </span>
    </div>
    <p class="mt-1 break-all font-mono text-[10.5px] leading-relaxed text-faint">
      {{ value.length > 56 ? value.slice(0, 56) + '…' : value }}
    </p>
    <p class="mt-0.5 text-[10.5px] leading-snug text-muted">{{ hint }}</p>
  </div>
</template>
