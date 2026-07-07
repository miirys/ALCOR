<script setup lang="ts">
import type { JSONSchema7 } from 'json-schema';

const props = defineProps<{
  schema: JSONSchema7;
  value: number;
  integer?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:value': [value: number];
}>();

function handleInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  const parsed = props.integer ? parseInt(raw, 10) : parseFloat(raw);
  if (!Number.isNaN(parsed)) {
    emit('update:value', parsed);
  }
}
</script>

<template>
  <input
    type="number"
    :value="value"
    :disabled="disabled"
    :min="(schema.minimum as number) ?? undefined"
    :max="(schema.maximum as number) ?? undefined"
    :step="integer ? 1 : 'any'"
    :placeholder="schema.default !== undefined ? String(schema.default) : ''"
    class="w-full h-8 px-2 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
    @input="handleInput"
  />
</template>
