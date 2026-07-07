<script setup lang="ts">
import { computed } from 'vue';
import type { AiTaskNodeConfig, Node, ParameterBinding } from '../../types';
import { useFlow } from '../../composables/useFlow';
import { useNodeForm } from '../../composables/useNodeForm';
import { usePromptBindingSync } from '../../composables/usePromptBindingSync';
import StringArrayInput from './StringArrayInput.vue';
import PromptEditor from './promptEditor/PromptEditor.vue';
import SchemaForm from './schema/SchemaForm.vue';
import ValidationBadges from './ValidationBadges.vue';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

const props = defineProps<{
  node: Node;
}>();

const { nodeTypeDefinitions } = useFlow();

const nodeRef = computed(() => props.node);
const {
  config,
  validation,
  availableOutputs,
  updateConfig,
  handleBindingUpdate,
  handleBindingRemove,
} = useNodeForm<AiTaskNodeConfig>(nodeRef);

const isRemote = computed(() => config.value.promptMode === 'remote');

function setMode(remote: boolean) {
  updateConfig({ promptMode: remote ? 'remote' : 'local' });
}

// ─── Remote-mode schema (from node type definition) ──────────────────────────

const remoteInputSchema = computed(() => {
  if (!isRemote.value) return null;
  const def = nodeTypeDefinitions.value.find((d) => d.type === 'ai-task');
  return def?.inputSchema ?? null;
});

const hasRemoteSchema = computed(() => {
  const schema = remoteInputSchema.value;
  return (
    schema != null &&
    schema.type === 'object' &&
    schema.properties != null &&
    Object.keys(schema.properties).length > 0
  );
});

const remoteParamNames = computed<Set<string>>(() => {
  const schema = remoteInputSchema.value;
  if (!schema || schema.type !== 'object' || !schema.properties) return new Set();
  return new Set(Object.keys(schema.properties));
});

/** Bindings scoped to remote-mode params only (excludes local-mode pill bindings). */
const remoteBindings = computed(() =>
  (config.value.parameterBindings ?? []).filter((b) => remoteParamNames.value.has(b.parameter)),
);

// ─── Prompt binding sync (shared with AgentNodeForm) ─────────────────────────

const bindingsRef = computed<ParameterBinding[]>(() => config.value.parameterBindings ?? []);
const localPromptRef = computed(() => config.value.localPrompt);

const { boundPaths, promptVarNames, handleBoundFieldsChange } = usePromptBindingSync({
  bindings: bindingsRef,
  localPrompt: localPromptRef,
  extraKeepParams: remoteParamNames,
  onBindingsChange: (next) => updateConfig({ parameterBindings: next }),
});

// ─── Mode-filtered validation ────────────────────────────────────────────────

const modeValidation = computed(() => {
  const v = validation.value;
  if (!v) return undefined;

  const activeParams = isRemote.value ? remoteParamNames.value : promptVarNames.value;
  const filtered = v.parameters.filter((p) => activeParams.has(p.parameter));
  const errorCount = filtered.filter(
    (p) => p.status.state === 'broken' || (p.status.state === 'unbound' && p.required),
  ).length;
  const warningCount = filtered.filter(
    (p) => p.status.state === 'type-mismatch' || p.status.state === 'warning',
  ).length;

  return {
    ...v,
    parameters: filtered,
    hasErrors: errorCount > 0,
    hasWarnings: warningCount > 0,
    errorCount,
    warningCount,
  };
});
</script>

<template>
  <div class="space-y-6">
    <!-- Mode Toggle -->
    <div class="flex items-center p-1 bg-muted rounded-lg border border-border">
      <button
        class="flex-1 text-xs font-medium py-1.5 rounded-md transition-all"
        :class="
          !isRemote
            ? 'bg-background shadow-sm text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="setMode(false)"
      >
        Local Prompt
      </button>
      <button
        class="flex-1 text-xs font-medium py-1.5 rounded-md transition-all"
        :class="
          isRemote
            ? 'bg-background shadow-sm text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="setMode(true)"
      >
        Remote Registry
      </button>
    </div>

    <template v-if="isRemote">
      <div class="space-y-3 animate-in fade-in slide-in-from-top-2">
        <div class="grid w-full items-center gap-1.5">
          <Label class="text-xs uppercase tracking-wider text-muted-foreground">Prompt ID</Label>
          <Input
            :value="config.promptId"
            @input="(e: any) => updateConfig({ promptId: (e.target as HTMLInputElement).value })"
            placeholder="e.g. summarize_issue"
          />
        </div>
        <div class="grid w-full items-center gap-1.5">
          <Label class="text-xs uppercase tracking-wider text-muted-foreground">Version</Label>
          <Input
            :value="config.promptVersion"
            @input="
              (e: any) => updateConfig({ promptVersion: (e.target as HTMLInputElement).value })
            "
            placeholder="^1.0.0"
          />
        </div>
      </div>
    </template>

    <template v-else>
      <div class="animate-in fade-in slide-in-from-top-2">
        <PromptEditor
          :model-value="config.localPrompt"
          :available-outputs="availableOutputs"
          :bound-paths="boundPaths"
          :editable="true"
          @update:model-value="(v) => updateConfig({ localPrompt: v })"
          @update:bound-fields="handleBoundFieldsChange"
        />
      </div>
    </template>

    <Separator />

    <!-- Max Corrections -->
    <div class="space-y-2">
      <Label class="text-xs uppercase tracking-wider text-muted-foreground">Max Corrections</Label>
      <Input
        type="number"
        :value="config.maxCorrectionAttempts ?? 3"
        @input="
          (e: any) =>
            updateConfig({
              maxCorrectionAttempts: parseInt((e.target as HTMLInputElement).value, 10) || 0,
            })
        "
        min="0"
      />
      <p class="text-[10px] text-muted-foreground">
        Maximum number of retries if the AI task fails.
      </p>
    </div>

    <Separator />

    <ValidationBadges :validation="modeValidation" />

    <!-- Remote: schema-driven inputs from the node type definition -->
    <div v-if="isRemote && hasRemoteSchema && remoteInputSchema" class="space-y-3">
      <Label class="text-[10px] font-normal uppercase tracking-wider text-muted-foreground/60">
        Inputs
      </Label>
      <SchemaForm
        :schema="remoteInputSchema"
        :bindings="remoteBindings"
        :available-outputs="availableOutputs"
        :validations="modeValidation?.parameters ?? []"
        @update:binding="handleBindingUpdate"
        @remove:binding="handleBindingRemove"
      />
    </div>

    <Separator />

    <!-- Toolset -->
    <StringArrayInput
      label="Toolset"
      placeholder="Tool name"
      :model-value="config.toolset"
      @update:model-value="(val) => updateConfig({ toolset: val })"
    />
  </div>
</template>
