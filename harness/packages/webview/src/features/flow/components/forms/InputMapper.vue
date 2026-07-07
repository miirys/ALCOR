<script setup lang="ts">
import { ref, watch } from 'vue';
import { Trash2, Plus, ArrowRight } from 'lucide-vue-next';
import type { NodeInput } from '../../types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const props = defineProps<{
  modelValue?: NodeInput[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: NodeInput[]];
}>();

const inputs = ref<NodeInput[]>([]);

watch(
  () => props.modelValue,
  (val) => {
    inputs.value = val?.map((x) => ({ ...x })) || [];
  },
  { immediate: true },
);

function emitUpdate() {
  emit('update:modelValue', inputs.value);
}

function add() {
  inputs.value.push({ from: '', as: '' });
  emitUpdate();
}

function remove(index: number) {
  inputs.value.splice(index, 1);
  emitUpdate();
}

function updateField(index: number, field: keyof NodeInput, value: any) {
  inputs.value[index] = { ...inputs.value[index], [field]: value } as NodeInput;
  emitUpdate();
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <Label class="text-xs uppercase tracking-wider text-muted-foreground">Inputs</Label>
      <Button
        @click="add"
        variant="ghost"
        size="sm"
        class="h-6 text-xs px-2 text-primary hover:text-primary/80"
      >
        <Plus class="w-3 h-3 mr-1" /> Add
      </Button>
    </div>

    <div class="space-y-2">
      <div
        v-for="(input, idx) in inputs"
        :key="idx"
        class="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center bg-muted/30 p-2 rounded-md border border-border/50 group"
      >
        <Input
          :model-value="input.from"
          @update:model-value="(v) => updateField(idx, 'from', v)"
          placeholder="context:goal"
          class="h-7 text-xs font-mono"
        />

        <ArrowRight class="w-3 h-3 text-muted-foreground/50" />

        <Input
          :model-value="input.as"
          @update:model-value="(v) => updateField(idx, 'as', v)"
          placeholder="alias"
          class="h-7 text-xs font-mono"
        />

        <Button
          @click="remove(idx)"
          variant="ghost"
          size="icon"
          class="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </Button>
      </div>

      <div
        v-if="inputs.length === 0"
        class="text-xs text-muted-foreground italic text-center py-3 border border-dashed border-border rounded bg-muted/10"
      >
        No inputs configured
      </div>
    </div>
  </div>
</template>
