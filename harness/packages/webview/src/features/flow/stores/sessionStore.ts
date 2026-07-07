import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getFlowMessageBus } from '../services/FlowMessageBus';
import type { SessionInfo } from '../types';

/**
 * Holds the active session snapshot — current GitLab user + project + role
 * — that drives the canvas's session indicator. Fetched lazily from the
 * backend; either side of the snapshot may be null if resolution failed.
 */
export const useSessionStore = defineStore('session', () => {
  const sessionInfo = ref<SessionInfo | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchSessionInfo(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      sessionInfo.value = await getFlowMessageBus().sendRequest('getSessionInfo', undefined);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch session info';
      sessionInfo.value = null;
    } finally {
      loading.value = false;
    }
  }

  function clear(): void {
    sessionInfo.value = null;
    loading.value = false;
    error.value = null;
  }

  return {
    sessionInfo,
    loading,
    error,
    fetchSessionInfo,
    clear,
  };
});
