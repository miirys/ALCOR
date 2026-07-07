<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { Play, Square, Terminal, ChevronDown, AlertCircle } from 'lucide-vue-next';
import { useFlow } from '../../composables/useFlow';
import { getEffectiveFlowInputs, validateContextInputs } from '../../utils/flow';
import type { RequiredContextInput } from '../../utils/flow';
import ExecutionTimeline from './ExecutionTimeline.vue';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const flow = useFlow();
const scrollAnchor = ref<HTMLElement | null>(null);

// Dynamic context inputs: uses formal schema when available, falls back to heuristic
const requiredInputs = computed<RequiredContextInput[]>(() =>
  getEffectiveFlowInputs(flow.flow.value),
);

// Track values for all context inputs
const contextInputs = ref<Record<string, string>>({});

// Initialize/reset context inputs when required inputs change
watch(
  requiredInputs,
  (inputs) => {
    const newContext: Record<string, string> = {};
    for (const input of inputs) {
      // Preserve existing values or initialize empty
      newContext[input.name] = contextInputs.value[input.name] || '';
    }
    contextInputs.value = newContext;
  },
  { immediate: true },
);

// Restore context from previous execution if available
watch(
  () => flow.executionContext.value,
  (ctx) => {
    if (ctx && Object.keys(ctx).length > 0) {
      for (const [key, value] of Object.entries(ctx)) {
        if (key in contextInputs.value) {
          contextInputs.value[key] = value;
        }
      }
    }
  },
  { immediate: true },
);

// Auto-scroll when events arrive
watch(
  () => flow.executionEvents.value.length,
  async () => {
    await nextTick();
    scrollAnchor.value?.scrollIntoView({ behavior: 'smooth' });
  },
);

const isRunning = computed(() => flow.isExecuting.value);

// Validation
const validation = computed(() => validateContextInputs(requiredInputs.value, contextInputs.value));

const canExecute = computed(() => {
  return validation.value.valid && flow.executionContextReady.value && !isRunning.value;
});

const hasInputs = computed(() => requiredInputs.value.length > 0);

async function handleExecute() {
  if (!canExecute.value) return;
  await flow.executeFlow(contextInputs.value);
}

function handleStop() {
  flow.cancelExecution();
}

function handleClose() {
  flow.toggleExecutionPanel();
}

function handleKeydown(event: KeyboardEvent) {
  if (event.ctrlKey && event.key === 'Enter' && canExecute.value) {
    handleExecute();
  }
}
</script>

<template>
  <div class="flex flex-col h-full bg-card border-t border-border shadow-2xl">
    <!-- Toolbar -->
    <div
      class="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border shrink-0"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground tracking-wider"
        >
          <Terminal class="w-4 h-4" />
          Execution Console
        </div>

        <div
          v-if="flow.executionStatus.value !== 'idle'"
          class="flex items-center gap-2 px-2 py-0.5 rounded-full bg-background border border-border"
        >
          <div
            class="w-2 h-2 rounded-full"
            :class="{
              'bg-green-500 animate-pulse': flow.executionStatus.value === 'running',
              'bg-green-500': flow.executionStatus.value === 'completed',
              'bg-red-500': flow.executionStatus.value === 'failed',
              'bg-amber-500': flow.executionStatus.value === 'stopped',
            }"
          />
          <span class="text-xs font-medium capitalize">{{ flow.executionStatus.value }}</span>
        </div>
      </div>

      <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          title="Minimize Console"
          @click="handleClose"
        >
          <ChevronDown class="w-4 h-4" />
        </Button>
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 min-h-0 flex">
      <!-- Left: Controls (Inputs) -->
      <div
        class="w-1/3 min-w-[300px] max-w-[400px] border-r border-border p-4 flex flex-col gap-4 bg-muted/10 overflow-y-auto"
        @keydown="handleKeydown"
      >
        <!-- No Inputs Warning -->
        <div
          v-if="!hasInputs"
          class="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg"
        >
          <AlertCircle class="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p class="text-sm font-medium text-amber-600 dark:text-amber-400">No Inputs Detected</p>
            <p class="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">
              This flow has no context inputs configured. Add inputs like
              <code class="bg-amber-500/20 px-1 rounded">context:goal</code> to your nodes.
            </p>
          </div>
        </div>

        <!-- Dynamic Input Fields -->
        <div v-for="input in requiredInputs" :key="input.name" class="space-y-1.5">
          <Label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {{ input.label }}
          </Label>

          <Textarea
            v-if="input.multiline"
            v-model="contextInputs[input.name]"
            :disabled="isRunning"
            :placeholder="input.placeholder"
            class="resize-none h-24 text-sm font-sans"
          />
          <Input
            v-else
            v-model="contextInputs[input.name]"
            :disabled="isRunning"
            :placeholder="input.placeholder"
            class="text-sm"
          />
        </div>

        <!-- Validation Warning -->
        <div
          v-if="!validation.valid && hasInputs"
          class="flex items-start gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-lg"
        >
          <AlertCircle class="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p class="text-xs text-destructive">
            Missing required fields: {{ validation.missing.join(', ') }}
          </p>
        </div>

        <!-- Execute / Stop Buttons -->
        <div class="mt-auto space-y-2">
          <Button
            v-if="!isRunning"
            class="w-full gap-2"
            :disabled="!canExecute"
            @click="handleExecute"
          >
            <Play class="w-4 h-4" /> Execute
          </Button>

          <Button v-else variant="destructive" class="w-full gap-2" @click="handleStop">
            <Square class="w-4 h-4" /> Stop Execution
          </Button>

          <p v-if="hasInputs" class="text-[10px] text-muted-foreground text-center">
            Press <kbd class="px-1 py-0.5 bg-muted rounded text-[9px]">Ctrl</kbd> +
            <kbd class="px-1 py-0.5 bg-muted rounded text-[9px]">Enter</kbd> to execute
          </p>
        </div>

        <!-- Error Display -->
        <div
          v-if="flow.executionError.value"
          class="text-xs text-destructive bg-destructive/10 p-2 rounded border border-destructive/20"
        >
          {{ flow.executionError.value }}
        </div>
      </div>

      <!-- Right: Logs (Output) -->
      <div class="flex-1 overflow-y-auto bg-background p-4">
        <div
          v-if="flow.executionEvents.value.length === 0"
          class="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50"
        >
          <Terminal class="w-8 h-8 mb-2" />
          <p class="text-sm">Ready to execute. Output will appear here.</p>
        </div>

        <ExecutionTimeline v-else :trace="flow.executionTrace.value" />
        <div ref="scrollAnchor" class="h-px w-full" />
      </div>
    </div>
  </div>
</template>
