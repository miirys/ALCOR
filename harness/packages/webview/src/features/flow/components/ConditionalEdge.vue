<script setup lang="ts">
import { computed } from 'vue';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@vue-flow/core';
import type { EdgeProps } from '@vue-flow/core';
import type { Edge } from '../types';

interface ConditionalEdgeData {
  irEdge: Edge;
  hasCondition: boolean;
}

const props = defineProps<EdgeProps<ConditionalEdgeData>>();

const path = computed(() =>
  getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  }),
);

const labelPosition = computed(() => {
  const [, labelX, labelY] = path.value;
  return { x: labelX, y: labelY };
});

const irEdge = computed(() => props.data?.irEdge);
const hasCondition = computed(() => props.data?.hasCondition);
</script>

<template>
  <BaseEdge :id="id" :style="style" :path="path[0]" :marker-end="markerEnd" />

  <EdgeLabelRenderer>
    <div
      :style="{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${labelPosition.x}px, ${labelPosition.y}px)`,
        pointerEvents: 'all',
      }"
      class="nodrag nopan"
    >
      <!-- Condition badge -->
      <div
        v-if="hasCondition"
        class="rounded-full bg-amber-600 px-3 py-1 text-xs font-medium text-white shadow-md"
        :title="`Condition: ${irEdge?.condition}`"
      >
        <span v-if="label">{{ label }}</span>
        <span v-else>Conditional</span>
      </div>

      <!-- Simple label for non-conditional edges -->
      <div
        v-else-if="label"
        class="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground shadow-md"
      >
        {{ label }}
      </div>
    </div>
  </EdgeLabelRenderer>
</template>
