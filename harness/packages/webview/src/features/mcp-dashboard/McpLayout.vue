<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useMcpStore } from './stores/mcpStore';

const mcpStore = useMcpStore();
const route = useRoute();

onMounted(async () => {
  // Try to get workspace URI from URL query parameter
  // The extension/LSP should pass this when creating the webview
  const workspaceUri = route.query.workspaceUri as string | undefined;

  await mcpStore.initialize(workspaceUri);
});

onUnmounted(() => {
  mcpStore.dispose();
});
</script>

<template>
  <div class="h-screen flex flex-col overflow-hidden">
    <router-view />
  </div>
</template>
