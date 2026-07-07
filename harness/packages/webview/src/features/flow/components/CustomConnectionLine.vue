<script setup lang="ts">
import { computed } from 'vue';
import { getBezierPath } from '@vue-flow/core';
import type { ConnectionLineProps } from '@vue-flow/core';

const props = defineProps<ConnectionLineProps>();

// Use the SAME path calculation as your final edges
const path = computed(() => {
  const [pathData] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });
  return pathData;
});
</script>

<template>
  <g>
    <path
      :d="path"
      fill="none"
      class="animated"
      :style="{
        stroke: 'var(--color-primary)',
        strokeWidth: '2px',
        opacity: 0.6,
      }"
    />
    <!-- Optional: Add a circle at the target position -->
    <circle
      :cx="targetX"
      :cy="targetY"
      r="4"
      :style="{
        fill: 'var(--color-primary)',
        opacity: 0.8,
      }"
    />
  </g>
</template>

<style scoped>
.animated {
  stroke-dasharray: 5;
  animation: dashdraw 0.5s linear infinite;
}

@keyframes dashdraw {
  to {
    stroke-dashoffset: -10;
  }
}
</style>
