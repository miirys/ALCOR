import { defineStore } from 'pinia';
import { ref } from 'vue';
import { type PaginationInfo } from '@gitlab-org/core';
import type { DuoWorkflowInfo } from '@gitlab-org/graphql';
import { useDebounceFn } from '@vueuse/core';
import { WorkflowFilter } from '@gitlab-lsp/workflow-api';
import {
  disposeDuoAgentPlatformMessageBus,
  DuoAgentPlatformMessageBus,
  getDuoAgentPlatformMessageBus,
} from '../services/DuoAgentPlatformMessageBus';
import { isDanglingPreCreatedWorkflow } from '../utils/preCreatedWorkflows';

// Changing this value may affect presence of scrollbar which infinite scroll loading is dependent on
const DEFAULT_PAGE_SIZE = 20;

type ErrorType = 'load' | 'delete' | null;

type HistoryError = {
  type: ErrorType;
  message: string;
};

type getChatThreadsParams = {
  // 	Returns the threads that come before the specified cursor.
  before?: string | null;
  // Returns the threads that come after the specified cursor.
  after?: string | null;
  // title or goal to search for.
  search?: string | null;
  // whether to append to existing list
  append?: boolean;
};

export const useHistoryStore = defineStore('history', () => {
  const areChatsLoading = ref(false);
  const pageInfo = ref<PaginationInfo>();
  const chats = ref<DuoWorkflowInfo[]>([]);
  const error = ref<HistoryError | null>(null);
  const searchTerm = ref<string | null>();

  let messageBus: DuoAgentPlatformMessageBus | null = null;

  function initialize(injectedMessageBus?: DuoAgentPlatformMessageBus) {
    if (messageBus) {
      return;
    }

    if (injectedMessageBus) {
      messageBus = injectedMessageBus;
    } else {
      messageBus = getDuoAgentPlatformMessageBus();
    }
  }

  async function dispose() {
    disposeDuoAgentPlatformMessageBus();
    messageBus = null;
  }

  function $reset() {
    areChatsLoading.value = false;
    pageInfo.value = undefined;
    chats.value = [];
    error.value = null;
  }

  function setChatsLoading(isLoading: boolean) {
    areChatsLoading.value = isLoading;
  }

  const searchChatThreads = useDebounceFn(async (search: string) => {
    await getChatThreads({ search: search || null });
  }, 500);

  async function getChatThreads({
    before = null,
    after = null,
    search = null,
    append = false,
  }: getChatThreadsParams = {}): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!messageBus) {
      return { success: false, error: 'Message bus not initialized' };
    }
    error.value = null;
    setChatsLoading(true);

    const count = before
      ? { first: null, last: DEFAULT_PAGE_SIZE }
      : { first: DEFAULT_PAGE_SIZE, last: null };

    try {
      const result = await messageBus.sendRequest('getUserWorkflows', {
        type: WorkflowFilter.FOUNDATIONAL_CHAT_AGENTS,
        after,
        before,
        first: count.first,
        last: count.last,
        search,
      });

      pageInfo.value = result.duoWorkflowWorkflows.pageInfo;
      searchTerm.value = search;
      const filteredWorkflows = result.duoWorkflowWorkflows.edges
        ?.map((edge) => edge.node)
        .filter((workflow) => !isDanglingPreCreatedWorkflow(workflow) && !workflow.archived);

      // This is to avoid infinite loading when we've reached last of active chats.
      if (filteredWorkflows?.length === 0) {
        pageInfo.value = { ...pageInfo.value, hasNextPage: false };
      }

      if (append) {
        chats.value = [...chats.value, ...(filteredWorkflows ?? [])];
      } else {
        chats.value = filteredWorkflows ?? [];
      }
      return { success: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      error.value = { type: 'load', message };
      return { success: false };
    } finally {
      setChatsLoading(false);
    }
  }

  async function deleteWorkflow(workflowId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!messageBus) {
      return { success: false, error: 'Message bus not initialized' };
    }
    error.value = null;
    try {
      const response = await messageBus.sendRequest('deleteWorkflow', {
        workflowId,
      });

      if (
        !response.deleteDuoWorkflowsWorkflow.success ||
        response.deleteDuoWorkflowsWorkflow.errors?.length > 0
      ) {
        const message =
          response.deleteDuoWorkflowsWorkflow.errors?.join(', ') || 'Failed to delete workflow';
        error.value = { type: 'delete', message };
        return { success: false, error: message };
      }

      // Filter out the deleted workflow from the list instead of refetching
      chats.value = chats.value.filter((chat) => chat.id !== workflowId);

      return {
        success: true,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      error.value = { type: 'delete', message };
      return { success: false, error: message };
    }
  }

  return {
    initialize,
    dispose,
    $reset,

    areChatsLoading,
    pageInfo,
    chats,
    searchTerm,
    error,

    getChatThreads,
    searchChatThreads,
    deleteWorkflow,
  };
});
