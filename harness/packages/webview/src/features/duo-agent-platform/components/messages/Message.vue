<script setup lang="ts">
import type { DuoMessage } from '@gitlab-org/graphql';
import { computed, toRef } from 'vue';
import type { HTMLAttributes } from 'vue';
import { storeToRefs } from 'pinia';
import { ToolApprovalType } from '@gitlab-lsp/workflow-api';
import { useChatStore } from '../../stores/chatStore';
import { useToolInfo } from '../../composables/useToolInfo';
import UserMessage from './UserMessage.vue';
import AgentMessage from './AgentMessage.vue';
import ToolMessage from './ToolMessage.vue';
import RequestMessage from './RequestMessage.vue';
import { messageVariants } from '.';
import { cn } from '@/lib/utils';

interface Props {
  class?: HTMLAttributes['class'];
  message: DuoMessage;
  isLastMessage?: boolean;
  wasApproved?: boolean;
}

const props = defineProps<Props>();

const chatStore = useChatStore();
const { isAwaitingApproval } = storeToRefs(chatStore);

const { toolInfo } = useToolInfo(toRef(() => props.message.toolInfo));

const handleCopyMessage = (message: string) => {
  chatStore.copyMessage(message);
};

const handleOpenUrl = (url: string) => {
  chatStore.openUrl(url);
};

const handleCopyCode = (code: string) => {
  chatStore.copyCodeSnippet(code);
};

const handleInsertCode = (code: string) => {
  chatStore.insertCodeSnippet(code);
};

const handleApproveOnce = () => {
  chatStore.sendToolApproval({
    userApproved: true,
    toolName: String(toolInfo.value?.tool ?? ''),
    type: ToolApprovalType.APPROVE_ONCE,
    toolArgs: toolInfo.value?.toolArgs as Record<string, unknown> | undefined,
  });
};

const handleReject = (reason: string) => {
  chatStore.sendToolApproval({
    userApproved: false,
    message: reason,
  });
};

const showApprovalButtons = computed(
  () =>
    props.isLastMessage &&
    isAwaitingApproval.value &&
    props.message.messageType === 'request' &&
    Boolean(props.message.toolInfo),
);

const messageComponent = computed(() => {
  switch (props.message.messageType) {
    case 'user':
      return UserMessage;
    case 'agent':
      return AgentMessage;
    case 'request':
      return RequestMessage;
    case 'tool':
      return ToolMessage;
    default:
      // TODO: Implement message component per messageType
      return AgentMessage;
  }
});

const variant = computed(() => {
  const type = props.message.messageType;
  if (type === 'user' || type === 'agent' || type === 'request' || type === 'tool') {
    return type;
  }
  return 'agent';
});
</script>
<template>
  <div :class="cn(messageVariants({ variant }), props.class)">
    <component
      :is="messageComponent"
      :message="props.message"
      @copy-message="handleCopyMessage"
      @open-url="handleOpenUrl"
      @copy-code="handleCopyCode"
      @insert-code="handleInsertCode"
      :awaiting-approval="showApprovalButtons"
      :was-approved="props.wasApproved"
      @approve-once="handleApproveOnce"
      @reject="handleReject"
    />
  </div>
</template>
