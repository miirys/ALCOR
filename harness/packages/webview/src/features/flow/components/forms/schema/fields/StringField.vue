<script setup lang="ts">
import { computed } from 'vue';
import type { JSONSchema7 } from 'json-schema';

const props = defineProps<{
  schema: JSONSchema7;
  value: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:value': [value: string];
}>();

const isEnum = computed(() => Array.isArray(props.schema.enum));
const enumValues = computed(() => (props.schema.enum as string[]) ?? []);
const isLongText = computed(() => (props.schema as Record<string, unknown>).format === 'textarea');
</script>

<template>
  <!-- Enum -> Dropdown -->
  <select
    v-if="isEnum"
    :value="value"
    :disabled="disabled"
    class="w-full h-8 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
    @change="emit('update:value', ($event.target as HTMLSelectElement).value)"
  >
    <option v-if="!value" value="" disabled>Select...</option>
    <option v-for="opt in enumValues" :key="String(opt)" :value="opt">{{ opt }}</option>
  </select>

  <!-- Long text -> Textarea -->
  <textarea
    v-else-if="isLongText"
    :value="value"
    :disabled="disabled"
    :placeholder="(schema.default as string) ?? ''"
    class="w-full min-h-[80px] px-2 py-1.5 rounded-md border border-input bg-background text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
    @input="emit('update:value', ($event.target as HTMLTextAreaElement).value)"
  />

  <!-- Default -> Text input -->
  <input
    v-else
    type="text"
    :value="value"
    :disabled="disabled"
    :placeholder="(schema.default as string) ?? schema.description?.slice(0, 50) ?? ''"
    class="w-full h-8 px-2 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
    @input="emit('update:value', ($event.target as HTMLInputElement).value)"
  />
</template>
