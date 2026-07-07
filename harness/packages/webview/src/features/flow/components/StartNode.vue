<script setup lang="ts">
import { computed, ref } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import type { NodeProps } from '@vue-flow/core';
import { Play, Settings } from 'lucide-vue-next';
import { START_NODE_ID } from '../constants';
import { useFlow } from '../composables/useFlow';
import { useExecutionStore } from '../stores/executionStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface StartNodeData {
  inputCount: number;
}

const props = defineProps<NodeProps<StartNodeData>>();

const { select, openPanel } = useFlow();
const executionStore = useExecutionStore();

const inputCount = computed(() => props.data.inputCount);
const isExecuting = computed(() => executionStore.isExecuting);

const isHovered = ref(false);
const showActions = computed(() => !isExecuting.value && (isHovered.value || props.selected));

function handleConfigure() {
  select(START_NODE_ID);
  openPanel();
}
</script>

<template>
  <div class="start-node relative" @mouseenter="isHovered = true" @mouseleave="isHovered = false">
    <!-- Configure button -->
    <Transition name="node-actions">
      <div v-if="showActions" class="absolute -top-3 -right-3 z-10">
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              type="button"
              aria-label="Configure workflow inputs"
              class="w-7 h-7 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              @click.stop="handleConfigure"
            >
              <Settings class="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Configure</TooltipContent>
        </Tooltip>
      </div>
    </Transition>

    <div
      class="rounded-full border-2 border-green-500 bg-card px-5 py-3 shadow-lg transition-all flex items-center gap-3"
      :class="{ 'ring-2 ring-green-500/30 ring-offset-2 ring-offset-background': props.selected }"
      :style="{ minWidth: '140px' }"
    >
      <div
        class="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/20 text-green-500"
      >
        <Play class="w-4 h-4" />
      </div>
      <div class="flex-1">
        <div class="text-sm font-bold text-foreground tracking-wide">START</div>
        <div v-if="inputCount > 0" class="text-[10px] text-muted-foreground">
          {{ inputCount }} input{{ inputCount !== 1 ? 's' : '' }}
        </div>
      </div>
    </div>

    <Handle
      type="source"
      :position="Position.Bottom"
      class="!bg-green-500 !w-3 !h-3 !border-2 !border-background hover:!scale-125 transition-transform"
    />
  </div>
</template>

<style scoped>
.start-node {
  cursor: default;
}
.start-node:hover {
  transform: translateY(-1px);
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
