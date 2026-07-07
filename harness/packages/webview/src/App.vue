<script setup lang="ts">
import { RouterView } from 'vue-router';
import { onUnmounted } from 'vue';
import { useGitLabConnectionInfo } from './composables/useGitLabConnectionInfo';
import { resetMcpService } from '@/features/mcp-dashboard/services/mcpServiceFactory';

useGitLabConnectionInfo();

// Clean up service when app unmounts (e.g., tab close, hot reload)
onUnmounted(async () => {
  await resetMcpService();
});
</script>

<template>
  <div id="app">
    <RouterView />
  </div>
</template>

<style scoped>
#app {
  min-height: 100vh;
}
</style>
