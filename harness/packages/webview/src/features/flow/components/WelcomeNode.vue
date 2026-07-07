<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import { Plus } from 'lucide-vue-next';
import { useComponentPicker } from '../composables/useComponentPicker';
import { useFlow } from '../composables/useFlow';

// VueFlow passes node props (id, type, position, …) that we don't use.
// Without a single root element, Vue can't auto-inherit them — suppress the warning.
defineOptions({ inheritAttrs: false });

defineProps<{ selected?: boolean }>();

const picker = useComponentPicker();
const { setEntryPoint } = useFlow();

function openPicker() {
  picker.open({
    onSelect: (nodeId) => setEntryPoint(nodeId),
  });
}
</script>

<template>
  <!-- Hidden target handle so the edge from START snaps precisely -->
  <Handle type="target" :position="Position.Top" class="!pointer-events-none !opacity-0" />

  <div class="flex flex-col items-center select-none" style="min-width: 240px">
    <!-- CTA card -->
    <button
      type="button"
      class="flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-blue-400/50 bg-blue-400/5 px-7 py-5 transition-all active:scale-[0.98] hover:border-blue-400/70 hover:bg-blue-400/10"
      @click.stop="openPicker"
    >
      <div class="flex items-center gap-2 text-foreground/90">
        <Plus class="h-4 w-4" />
        <span class="text-sm font-medium">Add your first component</span>
      </div>
      <span class="text-xs text-muted-foreground/70">Agent, AI Task, or Tool</span>
    </button>

    <!-- Keyboard hint -->
    <p class="mt-3.5 flex items-center gap-1.5 text-xs text-muted-foreground">
      or press
      <kbd
        class="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[11px] leading-none text-foreground/80"
      >
        /
      </kbd>
      to browse all components
    </p>
  </div>
</template>
