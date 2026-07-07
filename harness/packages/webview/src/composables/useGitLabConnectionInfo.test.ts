import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';

import type { GitLabConnectionInfo } from '@gitlab-org/webview-gitlab-connection/contract';
import { useGitLabConnectionInfo } from './useGitLabConnectionInfo';

let notificationHandlers: Record<string, (payload: unknown) => void> = {};

const mockMessageBus = {
  onNotification: vi.fn((method: string, handler: (payload: unknown) => void) => {
    notificationHandlers[method] = handler;
  }),
  sendNotification: vi.fn(),
  onRequest: vi.fn(),
  sendRequest: vi.fn(),
  dispose: vi.fn(),
};

vi.mock('@gitlab-org/webview-client', () => ({
  resolveMessageBus: vi.fn(() => mockMessageBus),
}));

describe('useGitLabConnectionInfo', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    notificationHandlers = {};
  });

  it('starts with connecting status before backend responds', () => {
    const { connectionInfo, isConnected } = useGitLabConnectionInfo();

    expect(connectionInfo.value.status).toBe('connecting');
    expect(isConnected.value).toBe(false);
  });

  it('sends appReady notification on initialization', () => {
    useGitLabConnectionInfo();

    expect(mockMessageBus.sendNotification).toHaveBeenCalledWith('appReady', undefined);
  });

  it('registers connectionStateChanged listener', () => {
    useGitLabConnectionInfo();

    expect(mockMessageBus.onNotification).toHaveBeenCalledWith(
      'connectionStateChanged',
      expect.any(Function),
    );
  });

  it('transitions from connecting to connected when notification arrives', async () => {
    const { connectionInfo, isConnected, hasProject, instanceUrl, projectPath } =
      useGitLabConnectionInfo();

    expect(connectionInfo.value.status).toBe('connecting');
    expect(isConnected.value).toBe(false);

    const connectedState: GitLabConnectionInfo = {
      status: 'connected',
      instance: {
        instanceUrl: 'https://gitlab.example.com/',
        instanceVersion: '17.8.0',
      },
      project: {
        projectPath: 'gitlab-org/gitlab',
        namespacePath: 'gitlab-org',
      },
      reason: null,
      featureStates: [],
    };

    notificationHandlers.connectionStateChanged?.(connectedState);
    await nextTick();

    expect(connectionInfo.value.status).toBe('connected');
    expect(isConnected.value).toBe(true);
    expect(hasProject.value).toBe(true);
    expect(instanceUrl.value).toBe('https://gitlab.example.com/');
    expect(projectPath.value).toBe('gitlab-org/gitlab');
  });

  it('reflects error state with reason', async () => {
    const { connectionInfo, isConnected } = useGitLabConnectionInfo();

    const errorState: GitLabConnectionInfo = {
      status: 'error',
      instance: null,
      project: null,
      reason: 'Token is invalid',
      featureStates: [],
    };

    notificationHandlers.connectionStateChanged?.(errorState);
    await nextTick();

    expect(connectionInfo.value.status).toBe('error');
    expect(connectionInfo.value.reason).toBe('Token is invalid');
    expect(isConnected.value).toBe(false);
  });

  it('exposes featureStates from the connection info', async () => {
    const { featureStates } = useGitLabConnectionInfo();

    const stateWithFeatures: GitLabConnectionInfo = {
      status: 'connected',
      instance: { instanceUrl: 'https://gitlab.example.com/', instanceVersion: '17.8.0' },
      project: null,
      reason: null,
      featureStates: [
        {
          featureId: 'flows' as const,
          engagedChecks: [],
          allChecks: [{ checkId: 'authentication-required' as const, engaged: false }],
        },
      ],
    };

    notificationHandlers.connectionStateChanged?.(stateWithFeatures);
    await nextTick();

    expect(featureStates.value).toHaveLength(1);
    expect(featureStates.value[0]?.featureId).toBe('flows');
  });

  it('shares state across multiple calls (singleton)', () => {
    const result1 = useGitLabConnectionInfo();
    const result2 = useGitLabConnectionInfo();

    // appReady should only be sent once
    expect(mockMessageBus.sendNotification).toHaveBeenCalledTimes(1);

    const state: GitLabConnectionInfo = {
      status: 'connected',
      instance: { instanceUrl: 'https://gitlab.example.com/', instanceVersion: '17.8.0' },
      project: null,
      reason: null,
      featureStates: [],
    };

    notificationHandlers.connectionStateChanged?.(state);

    expect(result1.connectionInfo.value.status).toBe('connected');
    expect(result2.connectionInfo.value.status).toBe('connected');
  });

  it('hasProject is false when project is null', () => {
    const { hasProject, projectPath } = useGitLabConnectionInfo();

    const state: GitLabConnectionInfo = {
      status: 'connected',
      instance: { instanceUrl: 'https://gitlab.example.com/', instanceVersion: '17.8.0' },
      project: null,
      reason: null,
      featureStates: [],
    };

    notificationHandlers.connectionStateChanged?.(state);

    expect(hasProject.value).toBe(false);
    expect(projectPath.value).toBeNull();
  });
});
