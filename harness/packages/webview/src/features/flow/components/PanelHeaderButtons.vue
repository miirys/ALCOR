<script setup lang="ts">
import { X, Maximize2, Minimize2 } from 'lucide-vue-next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

defineProps<{
  maximizable?: boolean;
  maximized?: boolean;
}>();

defineEmits<{
  close: [];
  'toggle-maximize': [];
}>();

const btnClass =
  'w-6 h-6 rounded-full flex items-center justify-center cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0';
</script>

<template>
  <Tooltip v-if="maximizable">
    <TooltipTrigger as-child>
      <button
        type="button"
        :aria-label="maximized ? 'Restore panel' : 'Maximize panel'"
        :class="btnClass"
        @click="$emit('toggle-maximize')"
      >
        <Minimize2 v-if="maximized" class="h-3.5 w-3.5" />
        <Maximize2 v-else class="h-3.5 w-3.5" />
      </button>
    </TooltipTrigger>
    <TooltipContent>{{ maximized ? 'Restore panel' : 'Maximize panel' }}</TooltipContent>
  </Tooltip>
  <Tooltip>
    <TooltipTrigger as-child>
      <button type="button" aria-label="Close panel" :class="btnClass" @click="$emit('close')">
        <X class="h-3.5 w-3.5" />
      </button>
    </TooltipTrigger>
    <TooltipContent>Close panel</TooltipContent>
  </Tooltip>
</template>
