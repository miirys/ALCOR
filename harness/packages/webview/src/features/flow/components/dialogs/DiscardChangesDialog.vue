<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

defineProps<{ open: boolean }>();
const emit = defineEmits<{
  'update:open': [value: boolean];
  confirm: [];
}>();
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>Discard unsaved changes?</DialogTitle>
        <DialogDescription>
          Your unsaved changes will be lost. This action cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <button
          type="button"
          class="px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-muted transition-colors"
          @click="emit('update:open', false)"
        >
          Cancel
        </button>
        <button
          type="button"
          class="px-4 py-2 text-sm font-medium rounded-md bg-destructive text-white hover:bg-destructive/90 transition-colors cursor-pointer"
          @click="emit('confirm')"
        >
          Discard & Reload
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
