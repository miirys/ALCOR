<script setup lang="ts">
import { AlertTriangle, AlertCircle } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  open: boolean;
  title: string;
  description: string;
  confirmButtonText: string;
}

defineProps<Props>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
  'update:open': [value: boolean];
}>();
</script>

<template>
  <Dialog :open="open" @update:open="(val) => !val && emit('cancel')">
    <DialogContent>
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <AlertTriangle class="h-5 w-5 text-yellow-500" />
          {{ title }}
        </DialogTitle>
        <DialogDescription>
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <div class="py-4">
        <Alert variant="default" class="border-yellow-200 bg-yellow-50">
          <AlertCircle class="h-4 w-4 text-yellow-600" />
          <AlertDescription class="text-sm text-yellow-900">
            <strong>The following changes will occur:</strong>
            <ul class="list-disc list-inside mt-1 space-y-0.5">
              <li>All comments will be stripped</li>
              <li>Property order will be rearranged</li>
              <li>Formatting will be standardized</li>
            </ul>
          </AlertDescription>
        </Alert>

        <p class="text-sm text-muted-foreground mt-3">
          After this first operation, the file will be managed by the dashboard and you won't see
          this warning again.
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('cancel')">Cancel</Button>
        <Button variant="default" @click="emit('confirm')">
          {{ confirmButtonText }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
