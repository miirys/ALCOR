<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { usePersistenceStore } from './stores';

const persistenceStore = usePersistenceStore();

onMounted(async () => {
  await persistenceStore.initialize();
});

onUnmounted(() => {
  persistenceStore.dispose();
});
</script>

<template>
  <router-view />
</template>
