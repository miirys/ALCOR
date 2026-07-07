<script setup lang="ts">
import { computed } from 'vue';
import { useVueFlow } from '@vue-flow/core';
import { Map, Minus, Plus, Maximize } from 'lucide-vue-next';
import { FLOW_ID } from '../constants';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const props = defineProps<{
  minimapVisible: boolean;
}>();

defineEmits<{
  'toggle-minimap': [];
}>();

const { zoomIn, zoomOut, zoomTo, fitView, viewport } = useVueFlow(FLOW_ID);

const zoomPercent = computed(() => `${Math.round(viewport.value.zoom * 100)}%`);

const btnClass =
  'w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none';
</script>

<template>
  <div class="canvas-controls flex items-center w-[192px] px-1.5 py-1">
    <!-- Minimap toggle -->
    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          :aria-label="props.minimapVisible ? 'Hide minimap' : 'Show minimap'"
          :class="[btnClass, props.minimapVisible && 'text-foreground bg-white/[0.06]']"
          @click="$emit('toggle-minimap')"
        >
          <Map class="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{{ props.minimapVisible ? 'Hide minimap' : 'Show minimap' }}</TooltipContent>
    </Tooltip>

    <!-- Zoom group -->
    <div class="flex-1 flex items-center justify-center gap-0.5">
      <Tooltip>
        <TooltipTrigger as-child>
          <button type="button" aria-label="Zoom out" :class="btnClass" @click="zoomOut()">
            <Minus class="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Zoom out</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger as-child>
          <button
            type="button"
            aria-label="Reset zoom to 100%"
            class="px-1 h-7 text-[11px] font-mono font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-white/[0.06] transition-colors cursor-pointer tabular-nums min-w-[36px] text-center"
            @click="zoomTo(1)"
          >
            {{ zoomPercent }}
          </button>
        </TooltipTrigger>
        <TooltipContent>Reset to 100%</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger as-child>
          <button type="button" aria-label="Zoom in" :class="btnClass" @click="zoomIn()">
            <Plus class="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Zoom in</TooltipContent>
      </Tooltip>
    </div>

    <!-- Fit to screen -->
    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          aria-label="Fit to screen"
          :class="btnClass"
          @click="fitView({ padding: 0.25 })"
        >
          <Maximize class="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Fit to screen</TooltipContent>
    </Tooltip>
  </div>
</template>
