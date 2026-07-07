<script setup lang="ts">
import { computed } from 'vue';
import { FolderOpen, Cloud } from 'lucide-vue-next';
import { useFlow } from '../composables/useFlow';
import { getFlowDestination } from '../utils/flowDestination';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const flow = useFlow();

const destination = computed(() =>
  getFlowDestination(flow.currentUri.value, flow.currentSummary.value),
);
</script>

<template>
  <div class="mb-2">
    <Tooltip>
      <TooltipTrigger as-child>
        <div
          class="flex items-center gap-1.5 px-2.5 py-1 bg-card/95 backdrop-blur-sm border border-border rounded-full shadow-sm text-xs text-muted-foreground select-none max-w-[260px]"
          :aria-label="destination.tooltip"
        >
          <component
            :is="destination.kind === 'catalog' ? Cloud : FolderOpen"
            class="h-3.5 w-3.5 shrink-0"
            :class="destination.kind === 'catalog' ? 'text-sky-500' : 'text-muted-foreground'"
          />
          <span class="font-medium text-foreground truncate">{{ destination.label }}</span>
          <span
            v-if="destination.kind === 'catalog' && destination.projectPath"
            class="text-muted-foreground/80 truncate"
          >
            · {{ destination.projectPath }}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>{{ destination.tooltip }}</TooltipContent>
    </Tooltip>
  </div>
</template>
