<script setup lang="ts">
import { computed } from 'vue';
import { Link2, Type, AlertTriangle, AlertCircle, CheckCircle2, Trash2 } from 'lucide-vue-next';
import type { JSONSchema7 } from 'json-schema';
import { formatPropertyLabel } from '../../../utils/flow';
import type { ParameterBinding, BindingKind, BindingStatus } from '../../../types';
import type { AvailableOutput } from '../../../utils/outputCatalog';
import type { ParameterValidation } from '../../../utils/bindingValidation';

import ReferencePicker from './ReferencePicker.vue';
import StringField from './fields/StringField.vue';
import NumberField from './fields/NumberField.vue';
import BooleanField from './fields/BooleanField.vue';
import ArrayField from './fields/ArrayField.vue';
import ObjectField from './fields/ObjectField.vue';

const props = defineProps<{
  parameterName: string;
  schema: JSONSchema7;
  required: boolean;
  binding: ParameterBinding | null;
  validation: ParameterValidation | null;
  availableOutputs: AvailableOutput[];
  disabled?: boolean;
  isObsolete?: boolean;
}>();

const emit = defineEmits<{
  'update:binding': [update: Partial<ParameterBinding>];
  'remove:binding': [];
  'highlight:node': [nodeId: string | null];
}>();

const currentKind = computed<BindingKind>(() => props.binding?.kind ?? 'unbound');

const label = computed(() => formatPropertyLabel(props.parameterName));
const description = computed(() => props.schema.description);
const schemaType = computed(() => {
  if (typeof props.schema.type === 'string') return props.schema.type;
  if (Array.isArray(props.schema.type)) return props.schema.type[0] ?? 'string';
  return 'string';
});

const status = computed<BindingStatus | null>(() => props.validation?.status ?? null);
const statusIcon = computed(() => {
  if (!status.value) return null;
  switch (status.value.state) {
    case 'valid':
      return { icon: CheckCircle2, class: 'text-green-500' };
    case 'broken':
      return { icon: AlertCircle, class: 'text-destructive' };
    case 'type-mismatch':
    case 'warning':
      return { icon: AlertTriangle, class: 'text-amber-500' };
    case 'unbound':
      return props.required ? { icon: AlertCircle, class: 'text-destructive/60' } : null;
    default:
      return null;
  }
});

const statusMessage = computed(() => {
  if (!status.value) return null;
  switch (status.value.state) {
    case 'broken':
      return status.value.reason;
    case 'type-mismatch':
      return `Expected ${status.value.expected}, got ${status.value.actual}`;
    case 'warning':
      return status.value.message;
    case 'unbound':
      return props.required ? 'Required parameter — needs a value' : null;
    default:
      return null;
  }
});

const isReferenceMode = computed(() => currentKind.value === 'reference');

function getDefaultValue(): unknown {
  if (props.schema.default !== undefined) return props.schema.default;
  switch (schemaType.value) {
    case 'string':
      return '';
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return '';
  }
}

function switchToLiteral() {
  emit('update:binding', {
    kind: 'literal',
    literalValue: props.binding?.literalValue ?? getDefaultValue(),
  });
}

function switchToReference() {
  emit('update:binding', {
    kind: 'reference',
    referencePath: props.binding?.referencePath ?? '',
  });
}

function updateLiteralValue(value: unknown) {
  emit('update:binding', { kind: 'literal', literalValue: value });
}

function updateReference(path: string) {
  emit('update:binding', { kind: 'reference', referencePath: path });
}

const compatibleOutputs = computed(() =>
  [...props.availableOutputs].sort((a, b) => {
    const aCompat = a.schemaType === schemaType.value ? 0 : 1;
    const bCompat = b.schemaType === schemaType.value ? 0 : 1;
    return aCompat - bCompat;
  }),
);
</script>

<template>
  <div
    class="group rounded-lg border transition-all duration-150"
    :class="[
      isObsolete
        ? 'border-border bg-muted/30 opacity-60'
        : status?.state === 'broken'
          ? 'border-destructive/40 bg-destructive/5'
          : status?.state === 'type-mismatch' || status?.state === 'warning'
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-border bg-card',
    ]"
  >
    <div class="px-3 py-2.5">
      <!-- Header: Label + Required badge + Mode toggle + Status -->
      <div class="flex items-center gap-2 mb-1.5">
        <label
          class="text-xs font-medium flex items-center gap-1.5"
          :class="isObsolete ? 'line-through text-muted-foreground' : 'text-foreground'"
        >
          {{ label }}
          <span
            v-if="required && !isObsolete"
            class="text-[9px] font-bold uppercase tracking-wider text-destructive/70 bg-destructive/10 px-1.5 py-0.5 rounded"
          >
            required
          </span>
          <span
            v-if="isObsolete"
            class="text-[9px] font-medium uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded no-underline"
            style="text-decoration: none"
          >
            unused
          </span>
        </label>

        <div class="ml-auto flex items-center gap-1">
          <!-- Validation status icon -->
          <component
            v-if="statusIcon"
            :is="statusIcon.icon"
            class="h-3.5 w-3.5"
            :class="statusIcon.class"
            :title="statusMessage ?? undefined"
          />

          <!-- Unused: Remove button -->
          <button
            v-if="isObsolete"
            class="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            title="Remove unused binding"
            :disabled="disabled"
            @click="emit('remove:binding')"
          >
            <Trash2 class="h-3 w-3" />
            Remove
          </button>

          <!-- Mode toggle: Literal / Reference (hidden for obsolete) -->
          <div v-else class="flex items-center rounded-md bg-muted p-0.5 gap-0.5">
            <button
              class="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all"
              :class="
                !isReferenceMode
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              "
              :disabled="disabled"
              title="Set a literal value"
              @click="switchToLiteral"
            >
              <Type class="h-3 w-3" />
              Value
            </button>
            <button
              class="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all"
              :class="
                isReferenceMode
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              "
              :disabled="disabled"
              title="Wire to an upstream output"
              @click="switchToReference"
            >
              <Link2 class="h-3 w-3" />
              Ref
            </button>
          </div>
        </div>
      </div>

      <!-- Description -->
      <p v-if="description" class="text-[11px] text-muted-foreground mb-2 leading-relaxed">
        {{ description }}
      </p>

      <!-- Reference Mode -->
      <ReferencePicker
        v-if="isReferenceMode"
        :current-path="binding?.referencePath ?? ''"
        :available-outputs="compatibleOutputs"
        :schema-type="schemaType"
        :status="status"
        :disabled="disabled"
        @update:path="updateReference"
        @highlight:node="(id) => emit('highlight:node', id)"
      />

      <!-- Literal Mode — dispatch to type-specific widget -->
      <template v-else-if="currentKind === 'literal' || currentKind === 'unbound'">
        <StringField
          v-if="schemaType === 'string'"
          :schema="schema"
          :value="(binding?.literalValue as string) ?? ''"
          :disabled="disabled"
          @update:value="updateLiteralValue"
        />
        <NumberField
          v-else-if="schemaType === 'number' || schemaType === 'integer'"
          :schema="schema"
          :value="(binding?.literalValue as number) ?? 0"
          :integer="schemaType === 'integer'"
          :disabled="disabled"
          @update:value="updateLiteralValue"
        />
        <BooleanField
          v-else-if="schemaType === 'boolean'"
          :value="(binding?.literalValue as boolean) ?? false"
          :disabled="disabled"
          @update:value="updateLiteralValue"
        />
        <ArrayField
          v-else-if="schemaType === 'array'"
          :schema="schema"
          :value="(binding?.literalValue as unknown[]) ?? []"
          :disabled="disabled"
          @update:value="updateLiteralValue"
        />
        <ObjectField
          v-else-if="schemaType === 'object'"
          :schema="schema"
          :value="(binding?.literalValue as Record<string, unknown>) ?? {}"
          :disabled="disabled"
          @update:value="updateLiteralValue"
        />
      </template>

      <!-- Status message -->
      <p
        v-if="statusMessage"
        class="mt-1.5 text-[10px] font-medium flex items-center gap-1"
        :class="{
          'text-destructive':
            status?.state === 'broken' || (status?.state === 'unbound' && required),
          'text-amber-600 dark:text-amber-400':
            status?.state === 'type-mismatch' || status?.state === 'warning',
        }"
      >
        {{ statusMessage }}
      </p>
    </div>
  </div>
</template>
