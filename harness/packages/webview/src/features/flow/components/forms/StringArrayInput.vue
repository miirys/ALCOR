<script setup lang="ts">
import { ref, watch } from 'vue';
import { X, Plus } from 'lucide-vue-next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

const props = defineProps<{
  modelValue?: string[];
  placeholder?: string;
  label: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
}>();

const newItem = ref('');
const items = ref<string[]>([]);

watch(
  () => props.modelValue,
  (val) => {
    items.value = [...(val || [])];
  },
  { immediate: true },
);

function add() {
  if (!newItem.value.trim()) return;
  const newItems = [...items.value, newItem.value.trim()];
  emit('update:modelValue', newItems);
  newItem.value = '';
}

function remove(index: number) {
  const newItems = items.value.filter((_, i) => i !== index);
  emit('update:modelValue', newItems);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    add();
  }
}
</script>

<template>
  <div class="space-y-2">
    <Label class="text-xs uppercase tracking-wider text-muted-foreground">{{ label }}</Label>

    <div class="flex gap-2">
      <Input
        v-model="newItem"
        type="text"
        :placeholder="placeholder"
        class="h-8 text-xs"
        @keydown="handleKeydown"
      />
      <Button
        @click="add"
        variant="secondary"
        size="icon"
        class="h-8 w-8 shrink-0"
        :disabled="!newItem.trim()"
      >
        <Plus class="w-4 h-4" />
      </Button>
    </div>

    <div class="flex flex-wrap gap-2 mt-2">
      <Badge
        v-for="(item, idx) in items"
        :key="idx"
        variant="secondary"
        class="gap-1 font-mono font-normal"
      >
        {{ item }}
        <button
          @click="remove(idx)"
          class="text-muted-foreground hover:text-destructive transition-colors ml-1 ring-offset-background rounded-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X class="w-3 h-3" />
        </button>
      </Badge>

      <div v-if="items.length === 0" class="text-xs text-muted-foreground italic">
        No items configured
      </div>
    </div>
  </div>
</template>
