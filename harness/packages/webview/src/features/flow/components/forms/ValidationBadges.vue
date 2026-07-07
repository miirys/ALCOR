<script setup lang="ts">
import type { NodeBindingValidation } from '../../utils/bindingValidation';
import { Badge } from '@/components/ui/badge';

defineProps<{
  validation: NodeBindingValidation | undefined;
}>();
</script>

<template>
  <div v-if="validation && (validation.hasErrors || validation.hasWarnings)" class="flex gap-2">
    <Badge v-if="validation.hasErrors" variant="destructive" class="text-[10px]">
      {{ validation.errorCount }} {{ validation.errorCount === 1 ? 'error' : 'errors' }}
    </Badge>
    <Badge
      v-if="validation.hasWarnings"
      variant="outline"
      class="text-[10px] text-amber-600 border-amber-500/30"
    >
      {{ validation.warningCount }}
      {{ validation.warningCount === 1 ? 'warning' : 'warnings' }}
    </Badge>
  </div>
</template>
