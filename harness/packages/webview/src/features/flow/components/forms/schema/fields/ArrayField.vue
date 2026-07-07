<script setup lang="ts">
import { computed } from 'vue';
import { Plus, Trash2 } from 'lucide-vue-next';
import type { JSONSchema7 } from 'json-schema';

const props = defineProps<{
  schema: JSONSchema7;
  value: unknown[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:value': [value: unknown[]];
}>();

const itemSchema = computed<JSONSchema7>(() => {
  if (typeof props.schema.items === 'object' && !Array.isArray(props.schema.items)) {
    return props.schema.items as JSONSchema7;
  }
  return { type: 'string' };
});

const itemType = computed(() => {
  const t = itemSchema.value.type;
  return typeof t === 'string' ? t : 'string';
});

function getDefaultItemValue(): unknown {
  switch (itemType.value) {
    case 'object':
      return {};
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    default:
      return '';
  }
}

function addItem() {
  emit('update:value', [...props.value, getDefaultItemValue()]);
}

function removeItem(index: number) {
  emit(
    'update:value',
    props.value.filter((_, i) => i !== index),
  );
}

function updateItem(index: number, newValue: unknown) {
  const updated = [...props.value];
  updated[index] = newValue;
  emit('update:value', updated);
}
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="(item, index) in value"
      :key="index"
      class="group relative flex items-center gap-2 rounded-md border border-border/60 bg-muted/10 p-2"
    >
      <div class="flex-1 min-w-0">
        <input
          v-if="itemType === 'string'"
          :value="item as string"
          :disabled="disabled"
          class="w-full h-7 px-2 rounded border border-input bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          @input="updateItem(index, ($event.target as HTMLInputElement).value)"
        />
        <input
          v-else-if="itemType === 'number' || itemType === 'integer'"
          type="number"
          :value="item as number"
          :disabled="disabled"
          :step="itemType === 'integer' ? 1 : 'any'"
          class="w-full h-7 px-2 rounded border border-input bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          @input="
            updateItem(
              index,
              itemType === 'integer'
                ? parseInt(($event.target as HTMLInputElement).value, 10)
                : parseFloat(($event.target as HTMLInputElement).value),
            )
          "
        />
        <span v-else class="text-xs text-muted-foreground italic px-2">
          Complex item ({{ itemType }})
        </span>
      </div>
      <button
        :disabled="disabled"
        class="shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
        @click="removeItem(index)"
      >
        <Trash2 class="h-3.5 w-3.5" />
      </button>
    </div>

    <button
      :disabled="disabled"
      class="flex items-center gap-1.5 w-full px-3 py-2 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all disabled:opacity-50"
      @click="addItem"
    >
      <Plus class="h-3.5 w-3.5" />
      Add item
    </button>
  </div>
</template>
