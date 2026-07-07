<script setup lang="ts">
import { computed, watch } from 'vue';
import { Wrench, AlertTriangle } from 'lucide-vue-next';
import type { ToolNodeConfig, Node } from '../../types';
import { useFlow } from '../../composables/useFlow';
import { useNodeForm } from '../../composables/useNodeForm';
import InputMapper from './InputMapper.vue';
import StringArrayInput from './StringArrayInput.vue';
import SchemaForm from './schema/SchemaForm.vue';
import ValidationBadges from './ValidationBadges.vue';

const props = defineProps<{
  node: Node;
}>();

const { toolDefinitions, isCustomToolNode } = useFlow();

const nodeRef = computed(() => props.node);
const {
  config,
  validation,
  availableOutputs,
  updateConfig,
  handleBindingUpdate,
  handleBindingRemove,
} = useNodeForm<ToolNodeConfig>(nodeRef);

// Is this node a custom tool created this session?
const isCustom = computed(() => isCustomToolNode(props.node.id));

// Resolve the tool definition from the registry
const resolvedTool = computed(() => {
  const name = config.value.toolName;
  return name ? toolDefinitions.value.find((t) => t.name === name) : null;
});

const hasSchema = computed(() => {
  const schema = resolvedTool.value?.inputSchema;
  return schema != null && schema.type === 'object' && schema.properties != null;
});

// Rendering mode for the tool header:
//  - 'registered': tool was placed from the palette with a known tool name, or was
//    loaded from YAML and matches the registry. Header is read-only.
//  - 'custom': tool was created via "Custom Tool" this session. The tool name input
//    stays editable so the user can experiment — even if the name happens to match
//    a registry tool (in that case we show live "Matched: ..." feedback).
//    This flag is session-scoped: on reload, a matching tool will appear as 'registered'.
//  - 'unresolved': tool name was set (likely from YAML) but no longer matches the registry.
const mode = computed<'registered' | 'custom' | 'unresolved'>(() => {
  if (isCustom.value) return 'custom';
  if (resolvedTool.value) return 'registered';
  if (config.value.toolName) return 'unresolved';
  return 'custom';
});

// When tool name changes, auto-prune bindings if switching to a known tool schema
watch(
  () => config.value.toolName,
  (newTool, oldTool) => {
    if (newTool === oldTool) return;

    const tool = newTool ? toolDefinitions.value.find((t) => t.name === newTool) : null;
    const schema = tool?.inputSchema;
    if (!schema || schema.type !== 'object' || !schema.properties) return;

    const properties = schema.properties as Record<string, unknown>;
    const existing = config.value.parameterBindings ?? [];
    const preserved = existing.filter((b) => b.parameter in properties);
    updateConfig({ parameterBindings: preserved });
  },
);
</script>

<template>
  <div class="space-y-6">
    <!-- ════════════════════════════════════════════════════════════ -->
    <!-- MODE A: Registered tool — read-only header                 -->
    <!-- ════════════════════════════════════════════════════════════ -->
    <div v-if="mode === 'registered' && resolvedTool" class="space-y-1">
      <div class="flex items-center gap-2">
        <Wrench class="h-4 w-4 text-blue-500 shrink-0" />
        <span class="text-sm font-medium text-foreground">{{ resolvedTool.label }}</span>
        <span class="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          {{ resolvedTool.name }}
        </span>
      </div>
      <p v-if="resolvedTool.description" class="text-[10px] text-muted-foreground leading-relaxed">
        {{ resolvedTool.description }}
      </p>
    </div>

    <!-- ════════════════════════════════════════════════════════════ -->
    <!-- MODE B: Custom tool — editable name with live matching     -->
    <!-- ════════════════════════════════════════════════════════════ -->
    <div v-else-if="mode === 'custom'" class="space-y-2">
      <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Tool Name
      </label>
      <input
        :value="config.toolName || ''"
        type="text"
        placeholder="e.g. git_checkout"
        class="w-full px-3 py-1.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring font-mono"
        @input="(e) => updateConfig({ toolName: (e.target as HTMLInputElement).value })"
      />
      <!-- Live feedback when the typed name matches a registry tool.
           The input stays editable (unlike 'registered' mode) so the user
           can continue experimenting without committing to this tool. -->
      <p v-if="resolvedTool" class="text-[10px] text-muted-foreground">
        Matched: <span class="font-medium">{{ resolvedTool.label }}</span> —
        {{ resolvedTool.description }}
      </p>
      <p v-else-if="config.toolName" class="text-[10px] text-muted-foreground">
        No matching tool in registry. Using manual input configuration.
      </p>
    </div>

    <!-- ════════════════════════════════════════════════════════════ -->
    <!-- MODE C: Unresolved — tool was registered but no longer     -->
    <!-- ════════════════════════════════════════════════════════════ -->
    <div v-else class="space-y-2">
      <div class="flex items-center gap-2">
        <AlertTriangle class="h-4 w-4 text-amber-500 shrink-0" />
        <span class="text-sm font-medium text-foreground">{{ config.toolName }}</span>
      </div>
      <p class="text-[10px] text-amber-600">
        Tool "{{ config.toolName }}" is no longer in the registry. Using manual input configuration.
      </p>
    </div>

    <ValidationBadges :validation="validation" />

    <div class="h-px bg-border" />

    <!-- Schema-driven form (for both registered and custom tools that match) -->
    <div v-if="hasSchema && resolvedTool" class="space-y-3">
      <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Inputs
      </label>
      <SchemaForm
        :schema="resolvedTool.inputSchema!"
        :bindings="config.parameterBindings ?? []"
        :available-outputs="availableOutputs"
        :validations="validation?.parameters ?? []"
        @update:binding="handleBindingUpdate"
        @remove:binding="handleBindingRemove"
      />
    </div>

    <!-- Free-form mapper (custom with no match, or unresolved) -->
    <InputMapper
      v-else
      :model-value="config.inputs"
      @update:model-value="(val) => updateConfig({ inputs: val })"
    />

    <div class="h-px bg-border" />

    <!-- Toolset (Optional Override) -->
    <StringArrayInput
      label="Toolset (Optional)"
      placeholder="Tool name (overrides default)"
      :model-value="config.toolset"
      @update:model-value="(val) => updateConfig({ toolset: val })"
    />
  </div>
</template>
