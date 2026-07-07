<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue';
import { useRouter } from 'vue-router';
import { AlertCircleIcon } from 'lucide-vue-next';

import { useInfiniteScroll } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { useChat } from '../composables/useChat';
import EmptyHistory from '../components/chat-history/EmptyHistory.vue';
import ChatHistoryItemSkeleton from '../components/chat-history/ChatHistoryItemSkeleton.vue';
import ChatHistoryItem from '../components/chat-history/ChatHistoryItem.vue';
import NoResultsFound from '../components/chat-history/NoResultsFound.vue';
import { useUsageQuotaStore } from '../stores/usageQuotaStore';
import UsageQuotaAlert from '../components/UsageQuotaAlert.vue';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const router = useRouter();
const {
  chats,
  getChatThreads,
  searchChatThreads,
  areChatsLoading,
  error,
  deleteChatThread,
  pageInfo,
  searchTerm,
  resetActiveChat,
} = useChat();
const usageQuotaStore = useUsageQuotaStore();
const { usageQuotaExceeded, usageQuotaExceededMidStream } = storeToRefs(usageQuotaStore);

const historyListElement = useTemplateRef<HTMLElement | null>('historyList');
const deletingWorkflowId = ref<string | null>('');
const failedDeleteIds = ref<Set<string>>(new Set());

onMounted(async () => {
  // reset activeChat to unlock selected project path
  resetActiveChat();
  await getChatThreads();
});
const { isLoading: isLoadingMore } = useInfiniteScroll(
  historyListElement,
  async () => {
    await getChatThreads({
      after: pageInfo.value?.endCursor,
      append: true,
    });
  },
  {
    distance: 10,
    canLoadMore: () => {
      return pageInfo.value?.hasNextPage ?? false;
    },
  },
);

async function handleDelete(workflowId: string) {
  deletingWorkflowId.value = workflowId;
  failedDeleteIds.value.delete(workflowId);

  const { success } = await deleteChatThread(workflowId);
  deletingWorkflowId.value = null;

  if (!success) {
    failedDeleteIds.value.add(workflowId);
  }
}

async function handleRetry() {
  await getChatThreads();
}

async function handleSearchInput(event: Event) {
  const trimmedSearch = (event.target as HTMLInputElement).value.trim();

  if (trimmedSearch === searchTerm.value) {
    return;
  }
  searchTerm.value = trimmedSearch;
  await searchChatThreads(searchTerm.value);
}

function handleChatClick(workflowId: string) {
  // Extract numeric ID from GraphQL format if needed
  const numericId = workflowId.includes('gid://gitlab/')
    ? workflowId.split('/').pop() || workflowId
    : workflowId;
  // Navigate to the chat page with the workflow ID
  router.push({ name: 'chat-with-id', params: { workflowId: numericId } });
}
</script>
<template>
  <!-- Error State - Full Page Error (Load Failures) -->
  <Empty v-if="error?.type === 'load'" class="gl-my-3" variant="destructive">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <AlertCircleIcon />
      </EmptyMedia>
      <EmptyTitle>Unable to Load Chat History</EmptyTitle>
      <EmptyDescription
        >We're having trouble loading your previous conversations. This might be due to a connection
        issue or temporary service disruption.
      </EmptyDescription>
      <EmptyContent>
        <Button @click="handleRetry" aria-label="Retry loading chat history">Retry</Button>
      </EmptyContent>
    </EmptyHeader>
  </Empty>
  <div v-else class="flex flex-col h-full">
    <UsageQuotaAlert v-if="usageQuotaExceeded && !usageQuotaExceededMidStream" class="mb-2" />
    <Label for="search" class="sr-only">Search history</Label>
    <Input
      id="search"
      type="search"
      placeholder="Search history"
      :value="searchTerm"
      @input="handleSearchInput"
      class="shrink-0"
    />
    <div v-if="areChatsLoading && !isLoadingMore" aria-live="polite" aria-busy="true">
      <ChatHistoryItemSkeleton v-for="i in 3" :key="i" :data-testid="'history-item-skeleton'" />
    </div>
    <!-- Extend scrollbar by setting -mr-5 to viewport edge by offsetting Layout padding -->
    <ul
      v-else-if="chats.length > 0"
      ref="historyListElement"
      class="overflow-y-auto [scrollbar-gutter:stable] -mr-5 pr-5"
      :data-testid="'history-item-list'"
    >
      <ChatHistoryItem
        v-for="chat in chats"
        :key="chat.id"
        :id="chat.id"
        :goal="chat.goal!"
        :latest-checkpoint="chat.latestCheckpoint"
        :update-at="chat.updatedAt"
        :is-deleting="deletingWorkflowId === chat.id"
        :has-delete-error="failedDeleteIds.has(chat.id)"
        @delete="handleDelete"
        @click="handleChatClick"
        :class="{ 'opacity-20': deletingWorkflowId === chat.id }"
      />
      <div v-show="isLoadingMore" aria-live="polite" aria-busy="true">
        <ChatHistoryItemSkeleton :data-testid="'history-item-skeleton-loading-more'" />
      </div>
    </ul>
    <NoResultsFound v-else-if="searchTerm && chats.length === 0" />
    <EmptyHistory v-else />
  </div>
</template>
