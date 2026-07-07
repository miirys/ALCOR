<script setup lang="ts">
import { computed } from 'vue';
import { APPROVAL_TOOL_NAMES, COMMAND_TOOL_NAMES } from './constants';
import CommandToolDetails from './CommandToolDetails.vue';
import ToolApprovalDetails from './ToolApprovalDetails.vue';
import ToolExecutionDetails from './ToolExecutionDetails.vue';

interface Props {
  toolInfo: Record<string, unknown>;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  copyCode: [code: string];
}>();

const toolName = computed(() => String(props.toolInfo.tool ?? ''));
const args = computed<Record<string, unknown>>(
  () => (props.toolInfo.toolArgs as Record<string, unknown>) ?? {},
);
const toolResponse = computed(() => props.toolInfo.toolResponse ?? null);

const isCommandTool = computed(() => COMMAND_TOOL_NAMES.includes(toolName.value));

const isApprovalTool = computed(() => Object.values(APPROVAL_TOOL_NAMES).includes(toolName.value));
</script>

<template>
  <CommandToolDetails
    v-if="isCommandTool"
    :tool-name="toolName"
    :args="args"
    :tool-response="toolResponse"
    @copy-code="emit('copyCode', $event)"
  />
  <ToolApprovalDetails
    v-else-if="isApprovalTool"
    :tool-name="toolName"
    :args="args"
    @copy-code="emit('copyCode', $event)"
  />
  <ToolExecutionDetails
    v-else
    :tool-name="toolName"
    :args="args"
    :tool-response="toolResponse"
    @copy-code="emit('copyCode', $event)"
  />
</template>
