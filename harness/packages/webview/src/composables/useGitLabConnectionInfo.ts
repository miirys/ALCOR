import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useConnectionStore } from '@/stores/connectionStore';

/**
 * Reactive composable providing GitLab connection state.
 *
 * Thin wrapper over the `connection` Pinia store. Lazily initializes the
 * message bus on first call. All callers share the same store instance,
 * and connection state is visible in Vue DevTools.
 */
export function useGitLabConnectionInfo() {
  const store = useConnectionStore();
  store.ensureInitialized();

  const { connectionInfo, isConnected, hasProject, instanceUrl, projectPath, featureStates } =
    storeToRefs(store);

  return {
    connectionInfo: computed(() => connectionInfo.value),
    isConnected: computed(() => isConnected.value),
    hasProject: computed(() => hasProject.value),
    instanceUrl: computed(() => instanceUrl.value),
    projectPath: computed(() => projectPath.value),
    featureStates: computed(() => featureStates.value),
  };
}
