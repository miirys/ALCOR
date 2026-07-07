<script setup lang="ts">
import { computed } from 'vue';
import { Plus, Trash2 } from 'lucide-vue-next';
import type { FlowInputField } from '../../types';
import { useFlow } from '../../composables/useFlow';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const { flowInputs, setFlowInputs } = useFlow();

const inputs = computed(() => flowInputs.value);

function updateField(index: number, updates: Partial<FlowInputField>) {
  const updated = inputs.value.map((field, i) => (i === index ? { ...field, ...updates } : field));
  setFlowInputs(updated);
}

function addInput() {
  setFlowInputs([...inputs.value, { name: '', type: 'string' }]);
}

function removeInput(index: number) {
  setFlowInputs(inputs.value.filter((_, i) => i !== index));
}

function toggleMultiline(index: number) {
  const field = inputs.value[index];
  const isMultiline = field.format === 'multiline';
  updateField(index, { format: isMultiline ? undefined : 'multiline' });
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="inputs.length === 0" class="text-xs text-muted-foreground text-center py-4">
      No inputs defined. Add inputs that users will provide when executing this workflow.
    </div>

    <div v-for="(field, index) in inputs" :key="index" class="space-y-3">
      <div class="flex items-start gap-2">
        <div class="flex-1 space-y-2">
          <div class="grid w-full items-center gap-1.5">
            <Label class="text-xs uppercase tracking-wider text-muted-foreground">Name</Label>
            <Input
              :model-value="field.name"
              @update:model-value="(v: string) => updateField(index, { name: v })"
              placeholder="e.g. goal"
              class="font-mono text-sm"
            />
          </div>
          <div class="grid w-full items-center gap-1.5">
            <Label class="text-xs uppercase tracking-wider text-muted-foreground"
              >Description</Label
            >
            <Input
              :model-value="field.description"
              @update:model-value="
                (v: string) => updateField(index, { description: v || undefined })
              "
              placeholder="Describe this input..."
              class="text-sm"
            />
          </div>
          <label class="flex items-center gap-2 cursor-pointer">
            <button
              type="button"
              class="w-4 h-4 rounded border transition-colors flex items-center justify-center text-[10px]"
              :class="
                field.format === 'multiline'
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-input bg-background'
              "
              @click="toggleMultiline(index)"
            >
              <span v-if="field.format === 'multiline'">&#10003;</span>
            </button>
            <span class="text-xs text-muted-foreground">Multiline</span>
          </label>
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0 mt-5"
          title="Remove input"
          @click="removeInput(index)"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </Button>
      </div>
      <Separator v-if="index < inputs.length - 1" />
    </div>

    <Button variant="outline" size="sm" class="w-full gap-2" @click="addInput">
      <Plus class="w-3.5 h-3.5" /> Add Input
    </Button>
  </div>
</template>
