<script setup lang="ts">
import { useRouter } from 'vue-router';
import { CheckboxRoot, CheckboxIndicator } from 'reka-ui';
import { Check } from 'lucide-vue-next';
import type { McpTool } from '../types/mcp';
import { cn } from '@/lib/utils';

interface Props {
  tool: McpTool;
  showServerName?: boolean;
  isApproved?: boolean;
  readOnly?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showServerName: true,
  isApproved: false,
  readOnly: false,
});

const emit = defineEmits<{
  toggle: [toolName: string, approved: boolean];
}>();

const router = useRouter();

function navigateToDetails() {
  router.push(`/mcp/tools/${props.tool.name}`);
}

function handleCheckboxChange(checked: boolean | 'indeterminate') {
  if (props.readOnly) return;
  emit('toggle', props.tool.originalToolName, checked === true);
}
</script>

<template>
  <div
    class="group hover:bg-accent/50 transition-colors duration-150 rounded-md cursor-pointer border border-transparent hover:border-border"
    @click="navigateToDetails"
  >
    <div class="flex items-start gap-3 p-3">
      <CheckboxRoot
        @click.stop
        @update:model-value="handleCheckboxChange"
        :model-value="isApproved"
        :class="
          cn(
            'peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
            'mt-0.5',
            readOnly ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-primary/80',
          )
        "
        :title="readOnly ? 'Tool approval is read-only for this server' : 'Toggle tool approval'"
      >
        <CheckboxIndicator class="flex items-center justify-center text-current">
          <Check class="h-3 w-3" />
        </CheckboxIndicator>
      </CheckboxRoot>

      <div class="flex-1 min-w-0 space-y-1">
        <div>
          <h3 class="text-sm font-medium leading-tight">
            {{ showServerName ? tool.name : tool.originalToolName }}
          </h3>
          <p v-if="showServerName" class="text-xs text-muted-foreground mt-0.5">
            {{ tool.serverName }}
          </p>
        </div>
        <p class="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {{ tool.description || 'No description available' }}
        </p>
      </div>
    </div>
  </div>
</template>
