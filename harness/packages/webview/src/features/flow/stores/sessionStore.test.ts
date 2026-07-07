import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { SessionInfo } from '../types';
import { useSessionStore } from './sessionStore';

const mockSendRequest = vi.fn();

vi.mock('../services/FlowMessageBus', () => ({
  getFlowMessageBus: () => ({
    sendRequest: mockSendRequest,
  }),
}));

function fullSessionInfo(): SessionInfo {
  return {
    user: {
      id: 'gid://gitlab/User/1',
      username: 'jslaughter',
      name: 'John Slaughter',
      avatarUrl: 'https://gitlab.example/uploads/avatar.png',
    },
    project: {
      path: 'group/proj',
      id: 'gid://gitlab/Project/7',
      namespacePath: 'group',
      role: 'developer',
      canCreateCatalogItem: false,
      canReadCatalogItem: true,
    },
  };
}

describe('useSessionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with no session info', () => {
    const store = useSessionStore();
    expect(store.sessionInfo).toBeNull();
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('fetches and stores session info from the message bus', async () => {
    const expected = fullSessionInfo();
    mockSendRequest.mockResolvedValueOnce(expected);

    const store = useSessionStore();
    await store.fetchSessionInfo();

    expect(mockSendRequest).toHaveBeenCalledWith('getSessionInfo', undefined);
    expect(store.sessionInfo).toEqual(expected);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('captures errors and clears any prior session info', async () => {
    const store = useSessionStore();
    store.sessionInfo = fullSessionInfo();
    mockSendRequest.mockRejectedValueOnce(new Error('boom'));

    await store.fetchSessionInfo();

    expect(store.sessionInfo).toBeNull();
    expect(store.error).toBe('boom');
    expect(store.loading).toBe(false);
  });

  it('clear() resets all state', async () => {
    mockSendRequest.mockResolvedValueOnce(fullSessionInfo());
    const store = useSessionStore();
    await store.fetchSessionInfo();
    expect(store.sessionInfo).not.toBeNull();

    store.clear();

    expect(store.sessionInfo).toBeNull();
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });
});
