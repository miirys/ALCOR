<script setup lang="ts">
import { computed } from 'vue';
import type { JSONSchema7 } from 'json-schema';
import { formatPropertyLabel } from '../../../../utils/flow';

const props = defineProps<{
  schema: JSONSchema7;
  value: Record<string, unknown>;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:value': [value: Record<string, unknown>];
}>();

const properties = computed(() => {
  if (!props.schema.properties) return [];
  const required = new Set(props.schema.required ?? []);
  return Object.entries(props.schema.properties as Record<string, JSONSchema7>).map(
    ([key, propSchema]) => ({
      key,
      schema: propSchema,
      required: required.has(key),
      type: typeof propSchema.type === 'string' ? propSchema.type : 'string',
    }),
  );
});

function updateField(key: string, fieldValue: unknown) {
  emit('update:value', { ...props.value, [key]: fieldValue });
}
</script>

<template>
  <div class="space-y-2 pl-3 border-l-2 border-border/40">
    <div v-for="prop in properties" :key="prop.key" class="space-y-1">
      <label class="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
        {{ formatPropertyLabel(prop.key) }}
        <span v-if="prop.required" class="text-[8px] font-bold uppercase text-destructive/60">
          *
        </span>
      </label>

      <input
        v-if="prop.type === 'string'"
        :value="(value[prop.key] as string) ?? ''"
        :disabled="disabled"
        :placeholder="prop.schema.description?.slice(0, 40) ?? ''"
        class="w-full h-7 px-2 rounded border border-input bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        @input="updateField(prop.key, ($event.target as HTMLInputElement).value)"
      />

      <input
        v-else-if="prop.type === 'number' || prop.type === 'integer'"
        type="number"
        :value="(value[prop.key] as number) ?? 0"
        :disabled="disabled"
        :step="prop.type === 'integer' ? 1 : 'any'"
        class="w-full h-7 px-2 rounded border border-input bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        @input="
          updateField(
            prop.key,
            prop.type === 'integer'
              ? parseInt(($event.target as HTMLInputElement).value, 10)
              : parseFloat(($event.target as HTMLInputElement).value),
          )
        "
      />

      <button
        v-else-if="prop.type === 'boolean'"
        type="button"
        role="switch"
        :aria-checked="!!value[prop.key]"
        :disabled="disabled"
        class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50"
        :class="value[prop.key] ? 'bg-primary' : 'bg-muted'"
        @click="updateField(prop.key, !value[prop.key])"
      >
        <span
          class="pointer-events-none block h-4 w-4 rounded-full bg-background shadow ring-0 transition-transform"
          :class="value[prop.key] ? 'translate-x-4' : 'translate-x-0'"
        />
      </button>

      <span v-else class="text-[10px] text-muted-foreground italic">
        {{ prop.type }} (not editable inline)
      </span>
    </div>
  </div>
</template>
