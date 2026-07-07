<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { WorkflowMetadata } from '@gitlab-lsp/workflow-api';
import { SuggestedTask } from '../types';
import Suggestions from '../components/Suggestions.vue';
import TanukiAiSvg from '../svgs/TanukiAi.vue';
import { useChat } from '../composables/useChat';
import Message from '../components/messages/Message.vue';
import UsageQuotaAlert from '../components/UsageQuotaAlert.vue';
import { useChatStore } from '../stores/chatStore';
import { useModelsStore } from '../stores/modelsStore';
import { useUsageQuotaStore } from '../stores/usageQuotaStore';
import PromptInput from '../components/prompt_input/PromptInput.vue';
import ThinkingMessage from '../components/messages/ThinkingMessage.vue';
import WorkflowHealthCheck from '../components/health-check/WorkflowHealthCheck.vue';
import { resolveSlashCommandMessage } from '../utils/slashCommands.ts';
import { useHealthCheckStore } from '../stores/healthCheckStore.ts';
import DuoChatLayout from './DuoChatLayout.vue';
import Skeleton from '@/components/ui/skeleton/Skeleton.vue';

const route = useRoute();
const router = useRouter();
const {
  setActiveChat,
  resetActiveChat,
  activeChatMessages,
  currentProject,
  setSelectedAgent,
  rootFsPath,
} = useChat();
const chatStore = useChatStore();
const { isAwaitingApproval } = storeToRefs(chatStore);
const modelsStore = useModelsStore();
const usageQuotaStore = useUsageQuotaStore();
const { usageQuotaExceeded, usageQuotaExceededMidStream } = storeToRefs(usageQuotaStore);
const { isHealthLoading, showHealthCheckError } = storeToRefs(useHealthCheckStore());

const prompt = ref('');
const conversationEl = ref<HTMLElement | null>(null);
const isAtBottom = ref(true);
const SCROLL_BOTTOM_THRESHOLD_PX = 100;

const populatePrompt = (task: SuggestedTask) => {
  prompt.value = task.prompt;
};

const handleScroll = () => {
  if (!conversationEl.value) return;
  const { scrollTop, scrollHeight, clientHeight } = conversationEl.value;
  isAtBottom.value = scrollHeight - scrollTop - clientHeight <= SCROLL_BOTTOM_THRESHOLD_PX;
};

const scrollToBottom = (behavior: 'smooth' | 'instant' = 'smooth') => {
  if (!isAtBottom.value) return;
  nextTick(() => {
    if (conversationEl.value) {
      conversationEl.value.scrollTo({ top: conversationEl.value.scrollHeight, behavior });
    }
  });
};

// Show a "thinking" placeholder when loading but no agent reply has arrived yet
const showThinkingIndicator = computed(() => {
  if (!chatStore.isLoading) return false;
  const lastMsg = activeChatMessages.value[activeChatMessages.value.length - 1];
  return lastMsg?.messageType === 'user';
});

// Check if this is a new chat or loading existing conversation
const isNewChat = computed(() => !route.params.workflowId && activeChatMessages.value.length === 0);

onMounted(() => {
  // Load workflow if workflowId is in route params, otherwise reset to a clean state
  const { workflowId } = route.params;
  if (workflowId && typeof workflowId === 'string') {
    setActiveChat(workflowId);
  } else {
    resetActiveChat();
  }
});

// Watch for route changes to load different conversations (handles chat/:id → chat/:otherId
// where the component is reused without remounting)
watch(
  () => route.params.workflowId,
  (newWorkflowId) => {
    if (newWorkflowId && typeof newWorkflowId === 'string') {
      setActiveChat(newWorkflowId);
    } else {
      resetActiveChat();
    }
  },
);

watch([activeChatMessages, () => chatStore.isLoading], () => {
  scrollToBottom();
});

onBeforeUnmount(() => {
  usageQuotaStore.resetUsageQuotaExceededMidStream();
});

const handleSubmit = async (message: string) => {
  const resolved = resolveSlashCommandMessage(message, chatStore.slashCommands);

  if (resolved.kind === 'new-chat') {
    resetActiveChat();
    if (route.name !== 'chat') {
      await router.push({ name: 'chat' });
    }
    return;
  }

  isAtBottom.value = true;
  scrollToBottom('instant');

  const metadata: Partial<WorkflowMetadata> = {
    projectId: currentProject.value?.id ?? undefined,
    projectPath: currentProject.value?.namespaceWithPath,
    namespaceId: currentProject.value?.namespaceId ?? undefined,
    rootNamespaceId: currentProject.value?.rootNamespaceId ?? undefined,
    selectedModelIdentifier: modelsStore.selectedModelRef ?? undefined,
    rootFsPath: rootFsPath.value ?? undefined,
  };
  await chatStore.submitMessage(resolved.message, chatStore.workflowType, metadata);
};

const handleStop = () => {
  chatStore.stopWorkflow();
};
</script>
<template>
  <div v-if="isHealthLoading" class="h-full flex flex-col gap-5" data-testid="health-check-loading">
    <Skeleton class="h-20 w-20 rounded-full" />
    <Skeleton class="flex-3" />
    <Skeleton class="flex-1" />
  </div>
  <WorkflowHealthCheck
    v-else-if="showHealthCheckError"
    :project-path="currentProject?.namespaceWithPath"
  />
  <!-- Extend scrollbar by setting -mx-5 to viewport edge by offsetting Layout padding -->
  <DuoChatLayout v-else class="-mx-5">
    <template #header>
      <div class="px-5">
        <header v-if="isNewChat && !usageQuotaExceeded">
          <TanukiAiSvg class="gl-max-w-full" :style="{ height: '72px', width: '72px' }" />
          <h1 class="font-semibold text-3xl my-5">Chat with GitLab Duo</h1>
          <p class="my-5">
            Get help with code, planning, and, security, project management, and more
          </p>
          <p class="my-5">AI responses may be inaccurate.</p>
          <small class="text-muted-foreground"
            >Inactive session are deleted after 30 days.
            <!-- TODO: Link the document -->
            <a
              href="#"
              target="_blank"
              alt="Read more about the automatically deleted sessions"
              class="text-link-foreground"
              >Read more</a
            >.</small
          >
          <Suggestions v-if="isNewChat" @populate-prompt="populatePrompt" />
        </header>
        <UsageQuotaAlert
          v-else-if="usageQuotaExceeded && !usageQuotaExceededMidStream"
          class="mb-5"
        />
      </div>
    </template>
    <template #conversation>
      <div
        ref="conversationEl"
        class="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
        @scroll="handleScroll"
      >
        <div class="px-5">
          <Message
            v-for="(message, index) in activeChatMessages"
            :key="index"
            :message="message"
            :is-last-message="index === activeChatMessages.length - 1"
            :was-approved="
              message.messageType === 'tool' &&
              activeChatMessages[index - 1]?.messageType === 'request'
            "
          />
          <ThinkingMessage v-if="showThinkingIndicator" />
        </div>
      </div>
    </template>
    <template #footer>
      <div class="px-5">
        <UsageQuotaAlert v-if="usageQuotaExceededMidStream" inline />
        <PromptInput
          v-model="prompt"
          :is-loading="chatStore.isLoading"
          :can-stop="chatStore.canStop"
          :disabled="usageQuotaExceeded || isAwaitingApproval"
          @submit="handleSubmit"
          @stop="handleStop"
          @select-agent="setSelectedAgent"
        />
      </div>
    </template>
  </DuoChatLayout>
</template>
