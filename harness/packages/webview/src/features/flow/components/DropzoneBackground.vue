<script setup lang="ts">
import CanvasBackground from './CanvasBackground.vue';
</script>

<template>
  <div class="relative h-full w-full">
    <CanvasBackground />

    <div
      class="pointer-events-none absolute inset-0 z-10 flex h-full w-full items-center justify-center"
    >
      <slot />
    </div>
  </div>
</template>
