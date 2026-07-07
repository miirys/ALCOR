<script setup lang="ts">
import { computed } from 'vue';
import type { JSONSchema7 } from 'json-schema';
import type { ParameterBinding } from '../../../types';
import type { AvailableOutput } from '../../../utils/outputCatalog';
import type { ParameterValidation } from '../../../utils/bindingValidation';
import SchemaField from './SchemaField.vue';

const props = defineProps<{
  schema: JSONSchema7;
  bindings: ParameterBinding[];
  availableOutputs: AvailableOutput[];
  validations: ParameterValidation[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:binding': [parameter: string, binding: Partial<ParameterBinding>];
  'remove:binding': [parameter: string];
  'highlight:node': [nodeId: string | null];
}>();

const properties = computed(() => {
  const schemaProps =
    props.schema.type === 'object' && props.schema.properties
      ? (props.schema.properties as Record<string, JSONSchema7>)
      : {};
  const required = new Set(props.schema.required ?? []);

  const fromSchema = Object.entries(schemaProps).map(([key, propSchema]) => ({
    key,
    schema: propSchema,
    required: required.has(key),
    binding: props.bindings.find((b) => b.parameter === key) ?? null,
    validation: props.validations.find((v) => v.parameter === key) ?? null,
    isObsolete: false,
  }));

  // Bindings that no longer appear in the schema — show as obsolete
  const obsolete = props.bindings
    .filter((b) => !(b.parameter in schemaProps))
    .map((b) => ({
      key: b.parameter,
      schema: { type: 'string' as const } as JSONSchema7,
      required: false,
      binding: b,
      validation: props.validations.find((v) => v.parameter === b.parameter) ?? null,
      isObsolete: true,
    }));

  return [
    ...fromSchema.sort((a, b) => {
      if (a.required !== b.required) return a.required ? -1 : 1;
      return a.key.localeCompare(b.key);
    }),
    ...obsolete.sort((a, b) => a.key.localeCompare(b.key)),
  ];
});
</script>

<template>
  <div class="space-y-3">
    <SchemaField
      v-for="prop in properties"
      :key="prop.key"
      :parameter-name="prop.key"
      :schema="prop.schema"
      :required="prop.required"
      :binding="prop.binding"
      :validation="prop.validation"
      :available-outputs="availableOutputs"
      :disabled="disabled"
      :is-obsolete="prop.isObsolete"
      @update:binding="(update) => emit('update:binding', prop.key, update)"
      @remove:binding="emit('remove:binding', prop.key)"
      @highlight:node="(id) => emit('highlight:node', id)"
    />
  </div>
</template>
