<script setup lang="ts">
import { ref, computed } from 'vue';
import { Terminal, ChevronDown, ChevronRight, CheckCircle, XCircle } from 'lucide-vue-next';
import type { ChatLogMessage } from '../../types/execution';
import { formatTimestamp } from '../../utils/checkpoint';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const props = defineProps<{
  message: ChatLogMessage;
}>();

const isExpanded = ref(false);
const hasArgs = computed(
  () => props.message.toolInfo && Object.keys(props.message.toolInfo.args).length > 0,
);
</script>

<template>
  <div class="bg-card border border-border rounded-lg overflow-hidden">
    <div class="px-4 py-3">
      <!-- Header -->
      <div class="flex items-center gap-2">
        <Terminal class="h-4 w-4 text-primary shrink-0" />
        <span class="font-mono text-sm font-medium">{{ message.toolInfo?.name || 'tool' }}</span>

        <Badge
          v-if="message.status === 'success'"
          variant="outline"
          class="gap-1 text-green-600 dark:text-green-400 border-green-500/30 bg-green-500/10"
        >
          <CheckCircle class="h-3 w-3" />
          Success
        </Badge>
        <Badge v-else-if="message.status === 'failed'" variant="destructive" class="gap-1">
          <XCircle class="h-3 w-3" />
          Failed
        </Badge>

        <span class="text-xs text-muted-foreground ml-auto">
          {{ formatTimestamp(message.timestamp) }}
        </span>
      </div>

      <!-- Content preview -->
      <p class="text-sm text-muted-foreground mt-2 line-clamp-2">
        {{ message.content }}
      </p>
    </div>

    <!-- Arguments (collapsible) -->
    <Collapsible v-if="hasArgs" v-model:open="isExpanded">
      <CollapsibleTrigger
        class="flex items-center gap-1 w-full px-4 py-2 text-xs text-muted-foreground hover:bg-muted/50 border-t border-border transition-colors"
      >
        <component :is="isExpanded ? ChevronDown : ChevronRight" class="h-3.5 w-3.5" />
        <span>Arguments</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre
          class="px-4 py-3 bg-muted/50 text-xs font-mono overflow-x-auto border-t border-border"
          >{{ JSON.stringify(message.toolInfo?.args, null, 2) }}</pre
        >
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>
