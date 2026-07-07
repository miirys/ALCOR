<script setup lang="ts">
import { computed } from 'vue';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@vue-flow/core';
import type { EdgeProps } from '@vue-flow/core';

const props = defineProps<EdgeProps>();

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
</script>

<template>
  <BaseEdge :id="id" :style="style" :path="path[0]" :marker-end="markerEnd" />

  <EdgeLabelRenderer>
    <div
      v-if="label"
      :style="{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${labelPosition.x}px, ${labelPosition.y}px)`,
        pointerEvents: 'all',
      }"
      class="nodrag nopan"
    >
      <div
        class="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow-md"
      >
        {{ label }}
      </div>
    </div>
  </EdgeLabelRenderer>
</template>
