<script setup lang="ts">
import { ref, watch } from 'vue';
import { CloudUpload, AlertTriangle } from 'lucide-vue-next';
import type { CatalogFlowSummary, Flow } from '../types';
import { getFlowMessageBus } from '../services/FlowMessageBus';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const open = defineModel<boolean>('open', { required: true });

const props = defineProps<{
  flow: Flow;
}>();

const emit = defineEmits<{
  created: [payload: { uri: string; summary: CatalogFlowSummary }];
}>();

const name = ref('');
const description = ref('');
const isPublic = ref(false);
const submitting = ref(false);
const error = ref<string | null>(null);
const errorDetails = ref<string[] | null>(null);

watch(open, (isOpen) => {
  if (isOpen) {
    name.value = '';
    description.value = '';
    isPublic.value = false;
    submitting.value = false;
    error.value = null;
    errorDetails.value = null;
  }
});

async function handleSubmit() {
  if (!name.value.trim() || !description.value.trim()) {
    error.value = 'Name and description are required';
    errorDetails.value = null;
    return;
  }

  submitting.value = true;
  error.value = null;
  errorDetails.value = null;

  try {
    const result = await getFlowMessageBus().sendRequest('createCatalogFlow', {
      name: name.value.trim(),
      description: description.value.trim(),
      public: isPublic.value,
      flow: props.flow,
    });

    if (!result.success) {
      error.value = result.error;
      errorDetails.value = result.details ?? null;
      return;
    }

    emit('created', { uri: result.uri, summary: result.summary });
    open.value = false;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to create catalog flow';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <CloudUpload class="h-5 w-5" />
          Save to AI Catalog
        </DialogTitle>
        <DialogDescription>
          Publish the current flow as a new item in your project's AI Catalog. You can update it
          later from the editor.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div class="grid w-full items-center gap-1.5">
          <Label for="catalog-flow-name">Name</Label>
          <Input
            id="catalog-flow-name"
            v-model="name"
            placeholder="e.g. Resolve SAST Vulnerability"
            :disabled="submitting"
            required
            autofocus
          />
        </div>

        <div class="grid w-full items-center gap-1.5">
          <Label for="catalog-flow-description">Description</Label>
          <Textarea
            id="catalog-flow-description"
            v-model="description"
            rows="3"
            placeholder="What this flow does"
            :disabled="submitting"
            required
          />
        </div>

        <div class="grid w-full items-center gap-1.5">
          <Label class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Visibility
          </Label>
          <div class="flex items-center p-1 bg-muted rounded-lg border border-border">
            <button
              type="button"
              class="flex-1 text-xs font-medium py-1.5 rounded-md transition-all"
              :class="
                !isPublic
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              "
              :disabled="submitting"
              @click="isPublic = false"
            >
              Private
            </button>
            <button
              type="button"
              class="flex-1 text-xs font-medium py-1.5 rounded-md transition-all"
              :class="
                isPublic
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              "
              :disabled="submitting"
              @click="isPublic = true"
            >
              Public
            </button>
          </div>
        </div>

        <div
          v-if="error"
          class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
        >
          <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div class="space-y-1">
            <p>{{ error }}</p>
            <ul v-if="errorDetails && errorDetails.length > 0" class="list-disc pl-4">
              <li v-for="detail in errorDetails" :key="detail">{{ detail }}</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" :disabled="submitting" @click="open = false">
            Cancel
          </Button>
          <Button type="submit" :disabled="submitting">
            <span v-if="submitting">Saving...</span>
            <span v-else>Save</span>
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
