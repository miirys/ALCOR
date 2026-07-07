import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { resolveMessageBus } from '@gitlab-org/webview-client';
import type { MessageBus } from '@gitlab-org/message-bus';
import type { Disposable } from '@gitlab-org/disposable';
import {
  GITLAB_CONNECTION_WEBVIEW_ID,
  type GitLabConnectionMessages,
  type GitLabConnectionInfo,
} from '@gitlab-org/webview-gitlab-connection/contract';

type ConnectionMessageBus = MessageBus<{
  inbound: GitLabConnectionMessages['toWebview'];
  outbound: GitLabConnectionMessages['fromWebview'];
}>;

export const useConnectionStore = defineStore('connection', () => {
  const connectionInfo = ref<GitLabConnectionInfo>({
    status: 'connecting',
    instance: null,
    project: null,
    reason: null,
    featureStates: [],
  });

  // Lazy message bus initialization. resolveMessageBus returns the same
  // underlying transport for a given webviewId when resolved multiple times
  // (the HostApplicationMessageBusProvider returns window.gitlab.host which
  // is stable). The notification listener is registered once on first init.
  // On hot reload or re-mount, ensureInitialized is a no-op because
  // `initialized` is already true — the backend's onInstanceConnected fires
  // per transport-level connection, not per store access, so appReady only
  // needs to be sent once per bus lifetime.
  let initialized = false;
  let listenerDisposable: Disposable | null = null;

  function ensureInitialized(): void {
    if (initialized) return;
    initialized = true;

    const bus: ConnectionMessageBus = resolveMessageBus<{
      inbound: GitLabConnectionMessages['toWebview'];
      outbound: GitLabConnectionMessages['fromWebview'];
    }>({ webviewId: GITLAB_CONNECTION_WEBVIEW_ID });

    listenerDisposable = bus.onNotification(
      'connectionStateChanged',
      (info: GitLabConnectionInfo) => {
        connectionInfo.value = info;
      },
    );

    bus.sendNotification('appReady', undefined);
  }

  function dispose(): void {
    listenerDisposable?.dispose();
    listenerDisposable = null;
    initialized = false;
  }

  const isConnected = computed(() => connectionInfo.value.status === 'connected');
  const hasProject = computed(() => connectionInfo.value.project !== null);
  const instanceUrl = computed(() => connectionInfo.value.instance?.instanceUrl ?? null);
  const projectPath = computed(() => connectionInfo.value.project?.projectPath ?? null);
  const featureStates = computed(() => connectionInfo.value.featureStates);

  return {
    connectionInfo,
    isConnected,
    hasProject,
    instanceUrl,
    projectPath,
    featureStates,
    ensureInitialized,
    dispose,
  };
});
