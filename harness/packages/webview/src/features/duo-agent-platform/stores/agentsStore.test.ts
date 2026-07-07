import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import * as DuoAgentPlatformMessageBusModule from '../services/DuoAgentPlatformMessageBus';
import { useAgentsStore, DEFAULT_AGENT } from './agentsStore';

vi.mock('../services/DuoAgentPlatformMessageBus', () => ({
  getDuoAgentPlatformMessageBus: vi.fn(),
  disposeDuoAgentPlatformMessageBus: vi.fn(),
}));

interface MockMessageBus {
  onNotification: ReturnType<typeof vi.fn>;
  sendNotification: ReturnType<typeof vi.fn>;
  sendRequest: ReturnType<typeof vi.fn>;
}

const CUSTOM_AGENT = {
  id: 'agent-custom-1',
  name: 'Custom Agent',
  description: 'A catalog agent',
  foundational: false,
  pinnedItemVersionId: 'version-123',
};

const FOUNDATIONAL_AGENT = {
  id: 'gid://gitlab/Ai::Catalog::FoundationalChatAgent/test',
  name: 'Test Agent',
  description: 'A test foundational agent',
  foundational: true,
  referenceWithVersion: 'test_agent/v1',
};

describe('agentsStore', () => {
  let mockMessageBus: MockMessageBus;
  let store: ReturnType<typeof useAgentsStore>;

  beforeEach(() => {
    setActivePinia(createPinia());

    mockMessageBus = {
      onNotification: vi.fn(),
      sendNotification: vi.fn(),
      sendRequest: vi.fn(),
    };

    vi.mocked(DuoAgentPlatformMessageBusModule.getDuoAgentPlatformMessageBus).mockReturnValue(
      mockMessageBus as never,
    );

    store = useAgentsStore();
    store.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('has the default agent selected', () => {
      expect(store.agents).toEqual([DEFAULT_AGENT]);
      expect(store.selectedAgentId).toBe(DEFAULT_AGENT.id);
      expect(store.selectedAgent).toEqual(DEFAULT_AGENT);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
      expect(store.flowConfig).toBe('');
    });
  });

  describe('computed properties', () => {
    describe('workflowDefinition', () => {
      it('returns referenceWithVersion for foundational agents', () => {
        expect(store.workflowDefinition).toBe('chat');
      });

      it('falls back to "chat" when referenceWithVersion is undefined', async () => {
        mockMessageBus.sendRequest.mockResolvedValue({
          agents: [{ ...DEFAULT_AGENT, referenceWithVersion: undefined }],
        });
        await store.fetchAgents('p1', 'n1');

        expect(store.workflowDefinition).toBe('chat');
      });

      it('returns empty string for non-foundational agents', async () => {
        mockMessageBus.sendRequest.mockResolvedValue({
          agents: [CUSTOM_AGENT],
        });
        await store.fetchAgents('p1', 'n1');
        mockMessageBus.sendRequest.mockResolvedValue('flow-yaml');
        await store.selectAgent(CUSTOM_AGENT.id);

        expect(store.workflowDefinition).toBe('');
      });
    });

    describe('agentVersionId', () => {
      it('returns empty string for foundational agents', () => {
        expect(store.agentVersionId).toBe('');
      });

      it('returns pinnedItemVersionId for non-foundational agents', async () => {
        mockMessageBus.sendRequest.mockResolvedValue({
          agents: [CUSTOM_AGENT],
        });
        await store.fetchAgents('p1', 'n1');
        mockMessageBus.sendRequest.mockResolvedValue('flow-yaml');
        await store.selectAgent(CUSTOM_AGENT.id);

        expect(store.agentVersionId).toBe('version-123');
      });
    });

    describe('selectedAgent', () => {
      it('falls back to DEFAULT_AGENT when selectedAgentId is not found', () => {
        store.selectedAgentId = 'nonexistent';
        expect(store.selectedAgent).toEqual(DEFAULT_AGENT);
      });
    });
  });

  describe('fetchAgents', () => {
    beforeEach(() => {
      store.$reset();
    });

    it('sends fetchAgents request with projectId and namespaceId', async () => {
      mockMessageBus.sendRequest.mockResolvedValue({ agents: [DEFAULT_AGENT] });

      await store.fetchAgents('project-1', 'namespace-1');

      expect(mockMessageBus.sendRequest).toHaveBeenCalledWith('fetchAgents', {
        projectId: 'project-1',
        namespaceId: 'namespace-1',
      });
    });

    it('updates agents when result is non-empty', async () => {
      mockMessageBus.sendRequest.mockResolvedValue({
        agents: [DEFAULT_AGENT, CUSTOM_AGENT],
      });

      await store.fetchAgents('p1', 'n1');

      expect(store.agents).toEqual([DEFAULT_AGENT, CUSTOM_AGENT]);
    });

    it('set to default agent when result is empty', async () => {
      store.agents = [DEFAULT_AGENT, FOUNDATIONAL_AGENT];
      mockMessageBus.sendRequest.mockResolvedValue({ agents: [] });

      await store.fetchAgents('p1', 'n1');

      expect(store.agents).toEqual([DEFAULT_AGENT]);
    });

    it('sets loading state during fetch', async () => {
      let resolvePromise: (v: unknown) => void;
      mockMessageBus.sendRequest.mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
      );

      const fetchPromise = store.fetchAgents('p1', 'n1');
      expect(store.isLoading).toBe(true);

      resolvePromise!({ agents: [DEFAULT_AGENT] });
      await fetchPromise;

      expect(store.isLoading).toBe(false);
    });

    it('sets error on failure', async () => {
      mockMessageBus.sendRequest.mockRejectedValue(new Error('Network error'));

      await store.fetchAgents('p1', 'n1');

      expect(store.error).toBe('Failed to get more agents: Network error');
      expect(store.isLoading).toBe(false);
    });

    it('resets selectedAgentId when current selection is no longer available', async () => {
      mockMessageBus.sendRequest.mockResolvedValue({
        agents: [FOUNDATIONAL_AGENT],
      });
      store.selectedAgentId = 'nonexistent-id';

      await store.fetchAgents('p1', 'n1');

      expect(store.selectedAgentId).toBe(FOUNDATIONAL_AGENT.id);
    });
  });

  describe('selectAgent', () => {
    beforeEach(() => {
      store.$reset();
    });

    it('does nothing when agent is not in the list', async () => {
      await store.selectAgent('nonexistent-id');

      expect(store.selectedAgentId).toBe(DEFAULT_AGENT.id);
    });

    it('sets selectedAgentId for foundational agent without fetching flow config', async () => {
      mockMessageBus.sendRequest.mockResolvedValue({
        agents: [DEFAULT_AGENT, FOUNDATIONAL_AGENT],
      });
      await store.fetchAgents('p1', 'n1');
      mockMessageBus.sendRequest.mockClear();

      await store.selectAgent(FOUNDATIONAL_AGENT.id);

      expect(store.selectedAgentId).toBe(FOUNDATIONAL_AGENT.id);
      expect(mockMessageBus.sendRequest).not.toHaveBeenCalled();
      expect(store.flowConfig).toBe('');
    });

    it('fetches flow config for non-foundational agent', async () => {
      mockMessageBus.sendRequest.mockResolvedValue({
        agents: [DEFAULT_AGENT, CUSTOM_AGENT],
      });
      await store.fetchAgents('p1', 'n1');
      mockMessageBus.sendRequest.mockResolvedValue('custom-flow-yaml');

      await store.selectAgent(CUSTOM_AGENT.id);

      expect(mockMessageBus.sendRequest).toHaveBeenCalledWith('getAgentFlowConfig', {
        agentVersionId: 'version-123',
      });
      expect(store.flowConfig).toBe('custom-flow-yaml');
    });

    it('clears flowConfig to empty on flow config fetch failure', async () => {
      mockMessageBus.sendRequest.mockResolvedValue({
        agents: [DEFAULT_AGENT, CUSTOM_AGENT],
      });
      await store.fetchAgents('p1', 'n1');
      mockMessageBus.sendRequest.mockRejectedValue(new Error('fetch failed'));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await store.selectAgent(CUSTOM_AGENT.id);

      expect(store.flowConfig).toBe('');
    });
  });

  describe('selectAgentByRef', () => {
    beforeEach(async () => {
      mockMessageBus.sendRequest.mockResolvedValue({
        agents: [DEFAULT_AGENT, CUSTOM_AGENT, FOUNDATIONAL_AGENT],
      });
      await store.fetchAgents('p1', 'n1');
      mockMessageBus.sendRequest.mockResolvedValue('flow-yaml');
    });

    it('selects the agent whose pinnedItemVersionId matches', async () => {
      await store.selectAgentByRef(CUSTOM_AGENT.pinnedItemVersionId);

      expect(store.selectedAgentId).toBe(CUSTOM_AGENT.id);
    });

    it('selects the agent whose referenceWithVersion matches', async () => {
      await store.selectAgentByRef(FOUNDATIONAL_AGENT.referenceWithVersion);

      expect(store.selectedAgentId).toBe(FOUNDATIONAL_AGENT.id);
    });

    it('selects DEFAULT_AGENT when ref is empty', async () => {
      store.selectedAgentId = CUSTOM_AGENT.id;

      await store.selectAgentByRef('');

      expect(store.selectedAgentId).toBe(DEFAULT_AGENT.id);
    });

    it('selects DEFAULT_AGENT when ref is null', async () => {
      store.selectedAgentId = CUSTOM_AGENT.id;

      await store.selectAgentByRef(null);

      expect(store.selectedAgentId).toBe(DEFAULT_AGENT.id);
    });

    it('falls back to DEFAULT_AGENT when no agent matches the ref', async () => {
      store.selectedAgentId = CUSTOM_AGENT.id;

      await store.selectAgentByRef('unknown-ref');

      expect(store.selectedAgentId).toBe(DEFAULT_AGENT.id);
    });
  });

  describe('$reset', () => {
    it('resets all state to initial values', async () => {
      mockMessageBus.sendRequest.mockResolvedValue({
        agents: [DEFAULT_AGENT, CUSTOM_AGENT],
      });
      await store.fetchAgents('p1', 'n1');

      store.$reset();

      expect(store.isLoading).toBe(false);
      expect(store.agents).toEqual([DEFAULT_AGENT]);
      expect(store.selectedAgentId).toBe(DEFAULT_AGENT.id);
      expect(store.flowConfig).toBe('');
      expect(store.error).toBeNull();
    });
  });

  describe('dispose', () => {
    it('calls disposeDuoAgentPlatformMessageBus', () => {
      store.dispose();

      expect(DuoAgentPlatformMessageBusModule.disposeDuoAgentPlatformMessageBus).toHaveBeenCalled();
    });

    it('allows reinitialization after dispose', () => {
      store.dispose();

      const freshBus: MockMessageBus = {
        onNotification: vi.fn(),
        sendNotification: vi.fn(),
        sendRequest: vi.fn(),
      };
      store.initialize(freshBus as never);

      expect(DuoAgentPlatformMessageBusModule.getDuoAgentPlatformMessageBus).toHaveBeenCalledOnce();
    });
  });
});
