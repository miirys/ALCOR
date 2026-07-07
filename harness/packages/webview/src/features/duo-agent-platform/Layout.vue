<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import Navigation from './components/Navigation.vue';
import { useHistoryStore } from './stores/historyStore';
import './styles.css';
import { useChatStore } from './stores/chatStore';
import { useRepositoriesStore } from './stores/repositoriesStore';
import { useModelsStore } from './stores/modelsStore';
import { useAgentsStore } from './stores/agentsStore';
import { useUsageQuotaStore } from './stores/usageQuotaStore';

const historyStore = useHistoryStore();
const chatStore = useChatStore();
const repositoriesStore = useRepositoriesStore();
const modelsStore = useModelsStore();
const agentsStore = useAgentsStore();
const usageQuotaStore = useUsageQuotaStore();

onMounted(() => {
  historyStore.initialize();
  chatStore.initialize();
  repositoriesStore.initialize();
  modelsStore.initialize();
  agentsStore.initialize();
});

onUnmounted(() => {
  historyStore.dispose();
  chatStore.dispose();
  repositoriesStore.dispose();
  modelsStore.dispose();
  agentsStore.dispose();
});

const currentProject = computed(() => {
  const currentPath = chatStore.workflowProjectPath || repositoriesStore.selectedProjectPath;
  return repositoriesStore.allProjects.find((p) => p.namespaceWithPath === currentPath);
});

watch(
  [() => currentProject.value?.rootNamespaceId, () => agentsStore.workflowDefinition],
  ([rootNamespaceId, workflowDefinition]) => {
    if (!rootNamespaceId) return;
    usageQuotaStore.checkUsageQuota({
      rootNamespaceId,
      workflowDefinition: workflowDefinition || undefined,
    });
  },
  { immediate: true },
);
</script>

<template>
  <div class="side-panel h-screen flex flex-col overflow-hidden">
    <header class="flex justify-end sticky top-0 z-10">
      <Navigation />
    </header>
    <div class="flex-1 flex flex-col min-h-0 px-5 pb-5">
      <slot>
        <router-view />
      </slot>
    </div>
  </div>
</template>
