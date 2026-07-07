<script setup lang="ts">
import { computed, ref } from 'vue';
import { Plus, Trash2, AlertTriangle } from 'lucide-vue-next';
import type { AgentNodeConfig, Node, ParameterBinding } from '../../types';
import { useNodeForm } from '../../composables/useNodeForm';
import { usePromptBindingSync } from '../../composables/usePromptBindingSync';
import { resolveAgentInputSchema } from '../../utils/bindingValidation';
import ToolMultiSelect from './ToolMultiSelect.vue';
import PromptEditor from './promptEditor/PromptEditor.vue';
import SchemaForm from './schema/SchemaForm.vue';
import ValidationBadges from './ValidationBadges.vue';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

const props = defineProps<{
  node: Node;
}>();

const nodeRef = computed(() => props.node);
const {
  config,
  validation,
  availableOutputs,
  updateConfig,
  handleBindingUpdate,
  handleBindingRemove,
} = useNodeForm<AgentNodeConfig>(nodeRef);

const isRemote = computed(() => config.value.promptMode === 'remote');

// ─── Remote-mode ─────────────────────────────────────────────────────────────

const dynamicParams = computed(() => config.value.dynamicInputParams ?? []);

const remoteInputSchema = computed(() => {
  if (!isRemote.value) return null;
  return resolveAgentInputSchema(props.node);
});

const hasRemoteSchema = computed(() => {
  const schema = remoteInputSchema.value;
  return schema != null && schema.type === 'object' && schema.properties != null;
});

/** Bindings scoped to remote-mode params only (excludes local-mode pill bindings). */
const remoteBindings = computed(() => {
  const params = new Set(dynamicParams.value);
  return (config.value.parameterBindings ?? []).filter((b) => params.has(b.parameter));
});

// ─── Prompt binding sync (shared with AiTaskNodeForm) ────────────────────────

const bindingsRef = computed<ParameterBinding[]>(() => config.value.parameterBindings ?? []);
const localPromptRef = computed(() => config.value.localPrompt);
const remoteParamsRef = computed(() => new Set(dynamicParams.value));

const { boundPaths, promptVarNames, handleBoundFieldsChange } = usePromptBindingSync({
  bindings: bindingsRef,
  localPrompt: localPromptRef,
  extraKeepParams: remoteParamsRef,
  onBindingsChange: (next) => updateConfig({ parameterBindings: next }),
});

// ─── Mode-filtered validation ───────────────────────────────────────────────

/**
 * Validation filtered to the current mode's parameters.
 *
 * The validation system validates ALL parameterBindings regardless of
 * promptMode, so it flags local-mode bindings as "obsolete" in remote
 * mode and vice versa. We filter to only show the active mode's issues.
 */
const modeValidation = computed(() => {
  const v = validation.value;
  if (!v) return undefined;

  const activeParams = isRemote.value ? new Set(dynamicParams.value) : promptVarNames.value;

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

// ─── Mode toggle with destructive-action guard ────────────────────────────────

const pendingMode = ref<'local' | 'remote' | null>(null);

function confirmMode(remote: boolean) {
  const targetMode = remote ? 'remote' : 'local';
  if (targetMode === (isRemote.value ? 'remote' : 'local')) return;

  // Check if opposite side has content that would be hidden
  const hasLocalContent =
    config.value.localPrompt?.promptTemplate.system ||
    config.value.localPrompt?.promptTemplate.user;
  const hasRemoteContent = config.value.promptId;

  // Bindings for the opposite mode's parameters are also preserved-but-hidden
  const bindings = config.value.parameterBindings ?? [];
  const hasOppositeBindings = remote
    ? bindings.some((b) => promptVarNames.value.has(b.parameter))
    : bindings.some((b) => remoteParamsRef.value.has(b.parameter));

  const hasContent = (remote ? hasLocalContent : hasRemoteContent) || hasOppositeBindings;
  if (hasContent) {
    pendingMode.value = targetMode;
  } else {
    updateConfig({ promptMode: targetMode });
  }
}

function applyPendingMode() {
  if (pendingMode.value) {
    updateConfig({ promptMode: pendingMode.value });
    pendingMode.value = null;
  }
}

function addDynamicParam(name: string) {
  const trimmed = name.trim();
  if (!trimmed || dynamicParams.value.includes(trimmed)) return;
  updateConfig({ dynamicInputParams: [...dynamicParams.value, trimmed] });
}

function removeDynamicParam(index: number) {
  const updated = [...dynamicParams.value];
  updated.splice(index, 1);
  updateConfig({ dynamicInputParams: updated });
}
</script>

<template>
  <div class="space-y-6">
    <!-- Toolset -->
    <ToolMultiSelect
      label="Toolset"
      :model-value="config.toolset"
      @update:model-value="(val) => updateConfig({ toolset: val })"
    />

    <Separator />

    <!-- Mode Toggle -->
    <div class="flex items-center p-1 bg-muted rounded-lg border border-border">
      <button
        class="flex-1 text-xs font-medium py-1.5 rounded-md transition-all"
        :class="
          !isRemote
            ? 'bg-background shadow-sm text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="confirmMode(false)"
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
        @click="confirmMode(true)"
      >
        Remote Registry
      </button>
    </div>

    <!-- Mode-switch confirmation -->
    <div
      v-if="pendingMode !== null"
      class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-3 animate-in fade-in"
    >
      <div class="flex items-start gap-2">
        <AlertTriangle class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p class="text-xs text-foreground">
          <template v-if="pendingMode === 'remote'">
            Switching to Remote will hide your local prompt and its wired variables. Both are
            preserved if you switch back.
          </template>
          <template v-else>
            Switching to Local will hide your remote prompt ID and any bound input parameters. Both
            are preserved if you switch back.
          </template>
        </p>
      </div>
      <div class="flex gap-2">
        <Button size="sm" variant="outline" class="h-7 text-xs" @click="pendingMode = null">
          Cancel
        </Button>
        <Button size="sm" class="h-7 text-xs" @click="applyPendingMode"> Switch </Button>
      </div>
    </div>

    <!-- Remote mode -->
    <template v-if="isRemote">
      <div class="space-y-3 animate-in fade-in slide-in-from-top-2">
        <div class="grid w-full items-center gap-1.5">
          <Label class="text-[10px] font-normal uppercase tracking-wider text-muted-foreground/60">
            Prompt ID
          </Label>
          <Input
            :model-value="config.promptId"
            @update:model-value="(v: string) => updateConfig({ promptId: v })"
            placeholder="e.g. code_review_prompt"
          />
        </div>
        <div class="grid w-full items-center gap-1.5">
          <Label class="text-[10px] font-normal uppercase tracking-wider text-muted-foreground/60">
            Version
          </Label>
          <Input
            :model-value="config.promptVersion"
            @update:model-value="(v: string) => updateConfig({ promptVersion: v })"
            placeholder="^1.0.0"
          />
        </div>
      </div>
    </template>

    <!-- Local prompt mode -->
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

    <ValidationBadges :validation="modeValidation" />

    <!-- Remote: Dynamic input params + SchemaForm for wiring -->
    <template v-if="isRemote">
      <div class="space-y-3">
        <Label class="text-[10px] font-normal uppercase tracking-wider text-muted-foreground/60">
          Input Parameters
        </Label>
        <div class="space-y-2">
          <div
            v-for="(param, idx) in dynamicParams"
            :key="param"
            class="flex items-center gap-2 bg-muted/30 p-2 rounded-md border border-border/50 group"
          >
            <span class="flex-1 text-xs font-mono text-foreground">{{ param }}</span>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              @click="removeDynamicParam(idx)"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </Button>
          </div>
          <form
            class="flex gap-2"
            @submit.prevent="
              (e) => {
                const input = (e.target as HTMLFormElement).elements.namedItem(
                  'param',
                ) as HTMLInputElement;
                if (input.value) {
                  addDynamicParam(input.value);
                  input.value = '';
                }
              }
            "
          >
            <Input name="param" placeholder="Parameter name" class="h-7 text-xs font-mono flex-1" />
            <Button type="submit" variant="ghost" size="sm" class="h-7 text-xs px-2 text-primary">
              <Plus class="w-3 h-3 mr-1" /> Add
            </Button>
          </form>
        </div>
      </div>

      <div v-if="hasRemoteSchema && remoteInputSchema" class="space-y-3">
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
    </template>
  </div>
</template>
