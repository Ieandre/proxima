<script setup lang="ts">
import { useStore } from '../../store/useStore';
import EmptyState from './EmptyState.vue';
import PMView from './PMView.vue';
import RoomView from './RoomView.vue';

const st = useStore();
</script>

<template>
  <EmptyState v-if="!st.active" />
  <PMView v-else-if="st.active.kind === 'pm'" :key="`pm:${st.active.id}`" :peerId="st.active.id" />
  <RoomView v-else :key="`room:${st.active.id}`" :roomId="st.active.id" />
</template>
