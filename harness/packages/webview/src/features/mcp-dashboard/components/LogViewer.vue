<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue';
import { Terminal, X, ChevronDown, ChevronUp } from 'lucide-vue-next';
import type { McpLogEntry, ServerName } from '../types/mcp';
import { LogLevel } from '../types/mcp';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
  serverName: ServerName;
  logs: McpLogEntry[];
  maxHeight?: string;
}

const props = withDefaults(defineProps<Props>(), {
  maxHeight: '400px',
});

const emit = defineEmits<{
  clear: [];
}>();

const logContainer = ref<HTMLElement | null>(null);
const autoScroll = ref(true);
const isExpanded = ref(true);

// Filter logs by server
const serverLogs = computed(() => {
  return props.logs.filter((log) => log.serverName === props.serverName);
});

function scrollToBottom() {
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight;
  }
}

// Watch for new logs and auto-scroll
watch(
  () => serverLogs.value.length,
  async () => {
    if (autoScroll.value) {
      await nextTick();
      scrollToBottom();
    }
  },
);

function handleScroll() {
  if (!logContainer.value) return;

  const { scrollTop, scrollHeight, clientHeight } = logContainer.value;
  const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 10;

  autoScroll.value = isAtBottom;
}

function toggleAutoScroll() {
  autoScroll.value = !autoScroll.value;
  if (autoScroll.value) {
    scrollToBottom();
  }
}

function formatTimestamp(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

function getLevelBadgeVariant(
  level: LogLevel,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (level) {
    case LogLevel.Error:
      return 'destructive';
    case LogLevel.Warning:
      return 'outline';
    case LogLevel.Info:
      return 'default';
    case LogLevel.Debug:
      return 'secondary';
    default:
      return 'secondary';
  }
}

function getLevelColor(level: LogLevel): string {
  switch (level) {
    case LogLevel.Error:
      return 'text-destructive';
    case LogLevel.Warning:
      return 'text-amber-600';
    case LogLevel.Info:
      return 'text-blue-600';
    case LogLevel.Debug:
      return 'text-muted-foreground';
    default:
      return 'text-muted-foreground';
  }
}

// Cleanup
onUnmounted(() => {
  if (logContainer.value) {
    logContainer.value.removeEventListener('scroll', handleScroll);
  }
});
</script>

<template>
  <Card>
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Terminal class="h-4 w-4" />
          <CardTitle class="text-sm font-semibold">Server Logs</CardTitle>
          <Badge variant="secondary" class="text-xs">{{ serverLogs.length }}</Badge>
        </div>
        <div class="flex items-center gap-2">
          <Button
            v-if="serverLogs.length > 0"
            @click="toggleAutoScroll"
            variant="ghost"
            size="sm"
            class="h-7 text-xs"
            :class="{ 'text-primary': autoScroll }"
          >
            {{ autoScroll ? 'Auto-scroll: ON' : 'Auto-scroll: OFF' }}
          </Button>
          <Button @click="isExpanded = !isExpanded" variant="ghost" size="icon" class="h-7 w-7">
            <component :is="isExpanded ? ChevronUp : ChevronDown" class="h-4 w-4" />
          </Button>
          <Button
            v-if="serverLogs.length > 0"
            @click="emit('clear')"
            variant="ghost"
            size="icon"
            class="h-7 w-7"
          >
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>
    </CardHeader>
    <CardContent v-if="isExpanded">
      <div
        v-if="serverLogs.length > 0"
        ref="logContainer"
        class="bg-muted/30 rounded border font-mono text-xs overflow-y-auto"
        :style="{ maxHeight: maxHeight }"
        @scroll="handleScroll"
      >
        <div
          v-for="log in serverLogs"
          :key="log.id"
          class="flex items-start gap-2 px-3 py-1.5 border-b border-border/50 last:border-0 hover:bg-muted/50"
        >
          <span class="text-muted-foreground shrink-0 tabular-nums">{{
            formatTimestamp(log.timestamp)
          }}</span>
          <Badge :variant="getLevelBadgeVariant(log.level)" class="text-xs h-5 shrink-0">
            {{ log.level.toUpperCase() }}
          </Badge>
          <span class="flex-1" :class="getLevelColor(log.level)">{{ log.message }}</span>
        </div>
      </div>
      <div v-else class="bg-muted/30 rounded border p-6 text-center text-sm text-muted-foreground">
        No logs available. Activity will appear here in real-time.
      </div>
    </CardContent>
  </Card>
</template>
