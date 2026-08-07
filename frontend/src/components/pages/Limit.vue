<script setup lang="ts">
import { Icon } from '../ui';
</script>

<template>
  <li class="flex gap-2.5 text-[14px] leading-snug text-muted">
    <span class="mt-1 text-blue">
      <Icon name="shield" :size="14" />
    </span>
    <span><slot /></span>
  </li>
</template>
