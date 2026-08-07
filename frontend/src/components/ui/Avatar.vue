<script setup lang="ts">
import { computed } from 'vue';
import { avatarColor, initials } from './avatar';

const props = withDefaults(defineProps<{ id: string; pseudo: string; size?: number }>(), { size: 38 });

const c = computed(() => avatarColor(props.id));
</script>

<template>
  <span
    class="avatar"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${size * 0.36}px`,
      background: `linear-gradient(150deg, ${c}, color-mix(in srgb, ${c} 55%, #000))`,
      boxShadow: `0 6px 18px -8px ${c}88`,
    }"
  >
    {{ initials(pseudo) }}
  </span>
</template>
