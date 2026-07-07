<script setup lang="ts">
import type { ChatLogMessage } from '../../types/execution';
import ToolCallEntry from './ToolCallEntry.vue';
import AgentResponseEntry from './AgentResponseEntry.vue';

defineProps<{
  message: ChatLogMessage;
}>();
</script>

<template>
  <div class="relative pl-12 py-2">
    <!-- Timeline dot -->
    <div
      class="absolute left-3 top-4 w-3 h-3 rounded-full border-2 border-background"
      :class="{
        'bg-primary': message.type === 'tool' && message.status === 'success',
        'bg-foreground': message.type === 'agent',
        'bg-destructive': message.status === 'failed',
        'bg-muted-foreground': message.status === 'pending',
      }"
    />

    <!-- Component provenance: which flow component produced this entry -->
    <div v-if="message.componentName" class="mb-1 text-xs font-mono text-muted-foreground">
      {{ message.componentName }}
    </div>

    <ToolCallEntry v-if="message.type === 'tool'" :message="message" />
    <AgentResponseEntry v-else :message="message" />
  </div>
</template>
