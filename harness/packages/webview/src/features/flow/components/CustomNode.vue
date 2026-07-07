<script setup lang="ts">
import { computed, ref } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import type { NodeProps } from '@vue-flow/core';
import { Settings, Trash2, Loader2 } from 'lucide-vue-next';
import type { Node } from '../types';
import type { NodeDisplayInfo } from '../utils';
import { useFlow } from '../composables/useFlow';
import { useExecutionStore } from '../stores/executionStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CustomNodeData {
  irNode: Node;
  displayInfo: NodeDisplayInfo;
}

const props = defineProps<NodeProps<CustomNodeData>>();

const { flow, select, openPanel, removeNode, getNodeValidation } = useFlow();
const executionStore = useExecutionStore();

const nodeData = computed(() => props.data.irNode);
const displayInfo = computed(() => props.data.displayInfo);
const nodeName = computed(() => nodeData.value.label || nodeData.value.id);
const isEntryPoint = computed(() => flow.value.entryPoint === nodeData.value.id);

// Execution overlay driven by the folded node-lifecycle log; the runtime →
// graph translation lives in executionStore. activeNodeIds can hold several
// nodes at once (parallel branches).
const isActive = computed(() => executionStore.activeNodeIds.has(nodeData.value.id));
const isExecuting = computed(() => executionStore.isExecuting);
const isVisited = computed(
  () => !isActive.value && executionStore.visitedNodeIds.has(nodeData.value.id),
);
const shouldDim = computed(
  () =>
    isExecuting.value &&
    executionStore.activeNodeIds.size > 0 &&
    !isActive.value &&
    !isVisited.value,
);

// Binding validation badges
const nodeValidation = computed(() => getNodeValidation(nodeData.value.id));
const bindingErrors = computed(() => nodeValidation.value?.errorCount ?? 0);
const bindingWarnings = computed(() => nodeValidation.value?.warningCount ?? 0);

// Hover + action visibility
const isHovered = ref(false);
const showActions = computed(() => !isExecuting.value && (isHovered.value || props.selected));

// Delete confirmation
const deleteDialogOpen = ref(false);

function handleConfigure() {
  select(nodeData.value.id);
  openPanel();
}

function handleDeleteConfirm() {
  deleteDialogOpen.value = false;
  removeNode(nodeData.value.id);
}
</script>

<template>
  <div
    class="custom-node rounded-xl border-2 bg-card px-5 py-4 shadow-lg transition-all relative"
    :data-node-id="nodeData.id"
    :data-original-id="nodeData.sourceComponentName"
    :style="{
      borderColor: isActive ? '#22c55e' : displayInfo.color,
      minWidth: '220px',
    }"
    :class="{
      'ring-4 ring-green-400/50 shadow-[0_0_20px_rgba(74,222,128,0.4)]': isActive,
      'ring-2 ring-green-500/25': isVisited,
      'opacity-50 grayscale': shouldDim,
    }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Pulse effect for entry point when running -->
    <div
      v-if="isExecuting && isEntryPoint && executionStore.activeNodeIds.size === 0"
      class="absolute inset-0 rounded-xl ring-4 ring-primary/30 animate-pulse pointer-events-none"
    />

    <!-- Hover/selected action buttons -->
    <Transition name="node-actions">
      <div v-if="showActions" class="absolute -top-3 -right-3 flex items-center gap-1 z-10">
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              type="button"
              aria-label="Configure node"
              class="w-7 h-7 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              @click.stop="handleConfigure"
            >
              <Settings class="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Configure</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              type="button"
              aria-label="Delete node"
              class="w-7 h-7 rounded-full bg-card border border-destructive/50 shadow-md flex items-center justify-center text-muted-foreground hover:text-white hover:bg-destructive transition-colors cursor-pointer"
              @click.stop="deleteDialogOpen = true"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </div>
    </Transition>

    <!-- Active Badge -->
    <div
      v-if="isActive"
      class="absolute -top-3 -right-3 flex items-center justify-center w-6 h-6 rounded-full bg-green-500 text-white shadow"
    >
      <Loader2 class="h-3.5 w-3.5 animate-spin" />
    </div>

    <!-- Binding Error Badge -->
    <div
      v-if="bindingErrors > 0 && !isActive"
      class="absolute -top-2 -left-2 flex items-center justify-center w-5 h-5 rounded-full bg-destructive text-white text-[9px] font-bold shadow"
      :title="`${bindingErrors} binding error(s)`"
    >
      {{ bindingErrors }}
    </div>
    <!-- Binding Warning Badge -->
    <div
      v-else-if="bindingWarnings > 0 && !isActive"
      class="absolute -top-2 -left-2 flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[9px] font-bold shadow"
      :title="`${bindingWarnings} binding warning(s)`"
    >
      {{ bindingWarnings }}
    </div>

    <Handle
      type="target"
      :position="Position.Top"
      class="!bg-muted-foreground !w-3 !h-3 !border-2 !border-background hover:!scale-125 transition-transform"
    />

    <div class="mb-3 flex items-center gap-3">
      <div
        class="flex items-center justify-center w-10 h-10 rounded-lg text-xl transition-colors"
        :style="{ backgroundColor: isActive ? '#22c55e20' : displayInfo.color + '20' }"
      >
        {{ displayInfo.icon }}
      </div>
      <div class="flex-1">
        <div class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
          {{ displayInfo.label }}
        </div>
        <div class="text-base font-semibold text-foreground mt-0.5">
          {{ nodeName }}
        </div>
      </div>
    </div>

    <Handle
      type="source"
      :position="Position.Bottom"
      class="!bg-muted-foreground !w-3 !h-3 !border-2 !border-background hover:!scale-125 transition-transform"
    />

    <!-- Delete confirmation dialog -->
    <Dialog v-model:open="deleteDialogOpen">
      <DialogContent class="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Delete "{{ nodeName }}"?</DialogTitle>
          <DialogDescription>
            This will remove the node and all its connections. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            class="px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-muted transition-colors"
            @click="deleteDialogOpen = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="px-4 py-2 text-sm font-medium rounded-md bg-destructive text-white hover:bg-destructive/90 transition-colors cursor-pointer"
            @click="handleDeleteConfirm"
          >
            Delete
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.custom-node {
  cursor: default;
}
.custom-node:hover {
  border-width: 2px;
  transform: translateY(-2px);
}
.custom-node .vue-flow__handle {
  transition: all 0.2s ease;
}
.node-actions-enter-active,
.node-actions-leave-active {
  transition: opacity 0.15s ease;
}
.node-actions-enter-from,
.node-actions-leave-to {
  opacity: 0;
}
</style>
