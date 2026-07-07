<script setup lang="ts">
import { computed } from 'vue';
import { Loader2 } from 'lucide-vue-next';
import type { ExecutionTrace } from '../../types/execution';
import TimelineEntry from './TimelineEntry.vue';

const props = defineProps<{
  trace: ExecutionTrace;
}>();

const isEmpty = computed(() => props.trace.messages.length === 0);
const isRunning = computed(() => props.trace.status === 'running');
</script>

<template>
  <div class="relative">
    <!-- Empty State -->
    <div v-if="isEmpty && !isRunning" class="text-center py-12">
      <p class="text-muted-foreground">No execution data available.</p>
    </div>

    <!-- Loading State -->
    <div v-else-if="isEmpty && isRunning" class="text-center py-12">
      <div class="inline-flex items-center gap-2 text-muted-foreground">
        <Loader2 class="h-4 w-4 animate-spin" />
        <span>Waiting for events...</span>
      </div>
    </div>

    <!-- Timeline -->
    <div v-else class="space-y-1">
      <!-- Vertical line -->
      <div class="absolute left-[19px] top-2 bottom-2 w-0.5 bg-border" />

      <TimelineEntry v-for="(message, index) in trace.messages" :key="index" :message="message" />

      <!-- Running indicator at bottom -->
      <div v-if="isRunning" class="relative pl-12 py-2">
        <div
          class="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary animate-pulse"
        />
        <span class="text-xs text-muted-foreground">Executing...</span>
      </div>
    </div>
  </div>
</template>
