<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { AlertTriangle, ArrowRight, GitFork, Trash2 } from 'lucide-vue-next';
import { useFlow } from '../../composables/useFlow';
import type { Edge } from '../../types';
import { validateConditionInput } from '../../utils/edgeConditionValidation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

const props = defineProps<{
  edge: Edge;
}>();

const {
  flow,
  updateEdge,
  removeEdge,
  nodeTypeDefinitions,
  toolDefinitions,
  runtimeProvidedVariableDefinitions,
} = useFlow();

// Internal state for the form fields
const conditionInput = ref('');
const conditionValue = ref('');

// True while we're synchronously copying props.edge.condition into the local
// refs. Used to suppress the auto-save watcher below, which would otherwise
// echo the parsed values straight back to updateEdge on every edge switch.
let isHydratingFromProps = false;

// Save changes as Simplified JSON. V1 backend requires both an input and a
// value/routes, so partial state stays local — we only persist when both
// fields are filled, and only clear the condition when both are emptied.
function saveCondition() {
  const inputFilled = conditionInput.value.trim() !== '';
  const valueFilled = conditionValue.value.trim() !== '';

  if (!inputFilled && !valueFilled) {
    if (props.edge.condition) {
      updateEdge(props.edge.id, { condition: undefined });
    }
    return;
  }

  if (!inputFilled || !valueFilled) {
    // Partial state — wait for both fields before persisting.
    return;
  }

  const simplified = {
    input: conditionInput.value,
    value: conditionValue.value,
  };

  updateEdge(props.edge.id, {
    condition: JSON.stringify(simplified),
  });
}

function handleDelete() {
  removeEdge(props.edge.id);
}

// Parse the edge.condition JSON into our fields. Watch both id and condition
// so switching to a different edge always resets the local form state, even
// when two edges happen to share the same condition value (e.g. both undefined).
watch(
  () => [props.edge.id, props.edge.condition] as const,
  ([, newCondition]) => {
    isHydratingFromProps = true;
    try {
      if (!newCondition) {
        conditionInput.value = '';
        conditionValue.value = '';
        return;
      }

      try {
        const parsed = JSON.parse(newCondition);
        if (parsed.input && parsed.value !== undefined) {
          conditionInput.value = parsed.input;
          conditionValue.value = String(parsed.value);
        } else if (parsed.input && parsed.routes) {
          conditionInput.value = parsed.input;
          const firstRoute = Object.keys(parsed.routes)[0];
          conditionValue.value = firstRoute || '';
        } else {
          conditionInput.value = '';
          conditionValue.value = '';
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Failed to parse edge condition', e);
        conditionInput.value = '';
        conditionValue.value = '';
      }
    } finally {
      // Refs update synchronously; the auto-save watch fires on the next tick.
      queueMicrotask(() => {
        isHydratingFromProps = false;
      });
    }
  },
  { immediate: true },
);

// Auto-save whenever either local ref changes. Replaces the previous @blur
// trigger, which fired unreliably through the shadcn <Input> wrapper.
watch([conditionInput, conditionValue], () => {
  if (isHydratingFromProps) return;
  saveCondition();
});

// Validate against the in-progress input so warnings appear as the user types,
// not only after the condition is persisted (which requires both fields filled).
const conditionWarning = computed(() => {
  const result = validateConditionInput(
    props.edge.id,
    props.edge.source,
    conditionInput.value,
    flow.value,
    nodeTypeDefinitions.value,
    toolDefinitions.value,
    runtimeProvidedVariableDefinitions.value,
  );
  return result.message;
});
</script>

<template>
  <div class="space-y-6">
    <!-- Label -->
    <div class="grid w-full items-center gap-1.5">
      <Label class="text-xs font-medium text-muted-foreground uppercase tracking-wider"
        >Label</Label
      >
      <Input
        :model-value="edge.label"
        @update:model-value="(v) => updateEdge(edge.id, { label: v as string })"
        placeholder="e.g. On Success"
      />
    </div>

    <Separator />

    <!-- Logic -->
    <div class="space-y-4">
      <div
        class="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider"
      >
        <GitFork class="w-3 h-3" />
        <span>Routing Logic</span>
      </div>

      <div class="bg-muted/20 border border-border/50 rounded-lg p-3 space-y-3">
        <!-- Variable -->
        <div class="grid w-full items-center gap-1.5">
          <Label class="text-[10px] text-muted-foreground font-mono"
            >If Input Variable matches...</Label
          >
          <Input
            v-model="conditionInput"
            placeholder="context:step.result"
            class="h-8 text-xs font-mono"
            :class="conditionWarning ? 'border-amber-500/60 focus-visible:ring-amber-500/40' : ''"
          />
          <p v-if="conditionWarning" class="flex items-start gap-1 text-[10px] text-amber-600">
            <AlertTriangle class="w-3 h-3 mt-px shrink-0" />
            <span>{{ conditionWarning }}</span>
          </p>
          <p v-else class="text-[10px] text-muted-foreground">
            Must be context: or status: prefixed (e.g., context:analyzer.status)
          </p>
        </div>

        <!-- Value -->
        <div class="grid w-full items-center gap-1.5">
          <Label class="text-[10px] text-muted-foreground font-mono">...this Value</Label>
          <div class="flex items-center gap-2">
            <Input v-model="conditionValue" placeholder="success" class="h-8 text-xs font-mono" />
            <ArrowRight class="w-4 h-4 text-muted-foreground" />
            <span class="text-xs font-medium text-muted-foreground whitespace-nowrap"
              >Take Path</span
            >
          </div>
          <p class="text-[10px] text-muted-foreground">
            Supports string, boolean (true/false), or numeric values.
          </p>
        </div>
      </div>

      <p class="text-[10px] text-muted-foreground">
        This edge will only be traversed if the variable matches the value. Leave empty for
        unconditional routing.
      </p>
    </div>

    <Separator />

    <Button @click="handleDelete" variant="destructive" class="w-full gap-2">
      <Trash2 class="w-4 h-4" />
      Delete Connection
    </Button>
  </div>
</template>
