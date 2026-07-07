<script setup lang="ts">
import { computed, provide, ref, watch } from 'vue';
import FlowCanvas from '../components/FlowCanvas.vue';
import WorkflowActionBar from '../components/WorkflowActionBar.vue';
import SessionInfoChip from '../components/SessionInfoChip.vue';
import PropertiesPanel from '../components/PropertiesPanel.vue';
import { ExecutionConsole } from '../components/execution';
import { useExecutionStore } from '../stores/executionStore';
import { useFlow } from '../composables/useFlow';
import ComponentPickerDialog from '../components/ComponentPickerDialog.vue';
import { PANEL_WIDTH, PANEL_INSET, PANEL_POSITION } from '../constants';
import { useLayoutMode, LAYOUT_MODE_KEY } from '../composables/useLayoutMode';
import { TooltipProvider } from '@/components/ui/tooltip';

const executionStore = useExecutionStore();
const flow = useFlow();
const isExecutionPanelOpen = computed(() => executionStore.isPanelOpen);

const workspaceRef = ref<HTMLElement | null>(null);
const layoutMode = useLayoutMode(workspaceRef);
provide(LAYOUT_MODE_KEY, layoutMode);

const panelMaximized = ref(false);

// Reset maximized state when panel closes or selection changes
watch(
  () => flow.panelOpen.value,
  (open) => {
    if (!open) panelMaximized.value = false;
  },
);

function closePanel() {
  flow.closePanel();
}

function toggleMaximize() {
  panelMaximized.value = !panelMaximized.value;
}

const panelStyle = { width: `${PANEL_WIDTH}px`, [PANEL_POSITION]: `${PANEL_INSET}px` };

const displayPath = computed(() => {
  const uri = flow.currentUri.value;
  if (!uri) return '';
  const parts = uri.replace(/^\/+/, '').split('/');
  return parts.length > 2 ? parts.slice(-2).join('/') : parts.join('/');
});
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div class="absolute inset-0 bg-background flex flex-col overflow-hidden">
      <!-- Main Workspace -->
      <div ref="workspaceRef" class="flex-1 relative min-h-0">
        <!-- Canvas (fills everything) -->
        <div class="absolute inset-0">
          <FlowCanvas />
        </div>

        <!-- Toolbar -->
        <div class="absolute top-3 left-3 z-30 flex flex-col items-start">
          <WorkflowActionBar />
        </div>

        <!-- Session info -->
        <div class="absolute top-3 right-3 z-30 flex flex-col items-end">
          <SessionInfoChip />
        </div>

        <!-- Status bar -->
        <div
          class="absolute bottom-3 right-3 z-20 flex items-center gap-2 px-3 py-1.5 bg-card/95 backdrop-blur-sm border border-border rounded-full text-sm text-muted-foreground pointer-events-none select-none"
        >
          <span v-if="displayPath" :title="flow.currentUri.value" class="truncate max-w-[200px]">
            {{ displayPath }}
          </span>
          <span v-if="displayPath" class="text-border">·</span>
          <span>{{ flow.nodeCount }} nodes</span>
          <span class="text-border">·</span>
          <span>{{ flow.edgeCount }} edges</span>
        </div>

        <!-- Wide mode: right-docked properties panel -->
        <div
          v-if="!layoutMode.isCompactLayout.value && flow.panelOpen.value && !panelMaximized"
          class="absolute top-3 bottom-3 z-30 pointer-events-auto"
          :style="panelStyle"
        >
          <div
            class="h-full bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          >
            <PropertiesPanel maximizable @close="closePanel" @toggle-maximize="toggleMaximize" />
          </div>
        </div>

        <!-- Wide mode: maximized properties panel -->
        <div
          v-if="!layoutMode.isCompactLayout.value && flow.panelOpen.value && panelMaximized"
          class="absolute inset-3 z-30 pointer-events-auto"
        >
          <div
            class="h-full bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          >
            <PropertiesPanel
              maximizable
              maximized
              @close="closePanel"
              @toggle-maximize="toggleMaximize"
            />
          </div>
        </div>
      </div>

      <!-- Compact mode: full-screen properties overlay -->
      <Teleport to="body">
        <Transition name="panel-overlay">
          <div
            v-if="layoutMode.isCompactLayout.value && flow.panelOpen.value"
            class="fixed inset-0 z-[90] flex flex-col"
            @keydown.escape="closePanel"
          >
            <div class="absolute inset-0 bg-background/60 backdrop-blur-sm" @click="closePanel" />
            <div
              class="relative flex-1 m-3 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              <PropertiesPanel @close="closePanel" />
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Bottom Panel: Execution Console -->
      <div
        class="border-t border-border transition-all duration-300 ease-in-out flex flex-col"
        :class="[isExecutionPanelOpen ? 'h-[400px]' : 'h-0 overflow-hidden']"
      >
        <ExecutionConsole />
      </div>

      <ComponentPickerDialog />
    </div>
  </TooltipProvider>
</template>

<style scoped>
.panel-overlay-enter-active,
.panel-overlay-leave-active {
  transition: opacity 0.2s ease;
}
.panel-overlay-enter-from,
.panel-overlay-leave-to {
  opacity: 0;
}
</style>
