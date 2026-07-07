import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { CatalogFlowSummary, Node, NodeId, Flow, FlowId } from '../types';
import { usePersistenceStore } from './persistenceStore';
import { useGraphStore } from './graphStore';
import { useUIStore } from './uiStore';

// ═══════════════════════════════════════════════════════════════════
// Mocks
// ═══════════════════════════════════════════════════════════════════

const mockSendRequest = vi.fn();
const mockSendNotification = vi.fn();
const mockOnNotification = vi.fn();

vi.mock('../services/FlowMessageBus', () => ({
  getFlowMessageBus: () => ({
    sendRequest: mockSendRequest,
    sendNotification: mockSendNotification,
    onNotification: mockOnNotification,
  }),
  disposeFlowMessageBus: vi.fn(),
}));

// Mock executionStore to avoid its fetchContext interfering
vi.mock('./executionStore', () => ({
  useExecutionStore: () => ({
    initializeListeners: vi.fn(),
    fetchContext: vi.fn().mockResolvedValue(undefined),
  }),
}));

// ═══════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════

function createTestNode(id: string): Node {
  return {
    id: id as NodeId,
    label: `node_${id}`,
    type: 'agent',
    position: { x: 0, y: 0 },
  };
}

function createTestFlow(): Flow {
  return {
    id: 'test-flow' as FlowId,
    entryPoint: 'node-1' as NodeId,
    nodes: {
      'node-1': createTestNode('node-1'),
    } as Flow['nodes'],
    edges: {},
  };
}

function setupMockRequests(handlers: Record<string, unknown>) {
  mockSendRequest.mockImplementation((requestType: string) => {
    if (requestType in handlers) {
      const handler = handlers[requestType];
      return typeof handler === 'function' ? handler() : Promise.resolve(handler);
    }
    return Promise.resolve(null);
  });
}

// ═══════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════

describe('usePersistenceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    // Reset window.location for URI parsing tests
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('starts with default values', () => {
      const store = usePersistenceStore();

      expect(store.currentUri).toBe('flow://default');
      expect(store.isDirty).toBe(false);
      expect(store.lastSavedAt).toBeNull();
      expect(store.saveError).toBeNull();
      expect(store.loadError).toBeNull();
      expect(store.nodeTypeDefinitions).toEqual([]);
      expect(store.definitionsLoaded).toBe(false);
      expect(store.isInitialized).toBe(false);
    });
  });

  describe('initialize', () => {
    it('parses URI from query params', async () => {
      window.location.search = '?uri=flow://my-custom-flow';
      setupMockRequests({ loadFlow: createTestFlow() });

      const store = usePersistenceStore();
      await store.initialize();

      expect(store.currentUri).toBe('flow://my-custom-flow');
    });

    it('sends appReady notification', async () => {
      setupMockRequests({ loadFlow: createTestFlow() });

      const store = usePersistenceStore();
      await store.initialize();

      expect(mockSendNotification).toHaveBeenCalledWith('appReady', undefined);
    });

    it('loads flow from backend on initialize', async () => {
      setupMockRequests({ loadFlow: createTestFlow() });

      const store = usePersistenceStore();
      await store.initialize();

      expect(mockSendRequest).toHaveBeenCalledWith('loadFlow', {
        uri: 'flow://default',
      });
    });

    it('sets isInitialized after successful init', async () => {
      setupMockRequests({ loadFlow: createTestFlow() });

      const store = usePersistenceStore();
      expect(store.isInitialized).toBe(false);

      await store.initialize();

      expect(store.isInitialized).toBe(true);
    });

    it('only initializes once (idempotent)', async () => {
      setupMockRequests({ loadFlow: createTestFlow() });

      const store = usePersistenceStore();
      await store.initialize();
      await store.initialize();
      await store.initialize();

      // loadFlow should only be called once (for the single initialize)
      const loadFlowCalls = mockSendRequest.mock.calls.filter(([type]) => type === 'loadFlow');
      expect(loadFlowCalls).toHaveLength(1);
    });

    it('registers notification handlers', async () => {
      setupMockRequests({ loadFlow: createTestFlow() });

      const store = usePersistenceStore();
      await store.initialize();

      expect(mockOnNotification).toHaveBeenCalledWith('initialState', expect.any(Function));
      expect(mockOnNotification).toHaveBeenCalledWith('flowSaved', expect.any(Function));
      expect(mockOnNotification).toHaveBeenCalledWith('flowChanged', expect.any(Function));
    });
  });

  describe('saveToBackend', () => {
    it('sends save request with current flow and URI', async () => {
      setupMockRequests({
        loadFlow: createTestFlow(),
        saveFlow: { success: true },
      });

      const persistenceStore = usePersistenceStore();
      const graphStore = useGraphStore();

      await persistenceStore.initialize();
      graphStore.addNode(createTestNode('new-node'));

      await persistenceStore.saveToBackend();

      expect(mockSendRequest).toHaveBeenCalledWith('saveFlow', {
        flow: graphStore.flow,
        uri: 'flow://default',
      });
    });

    it('returns success on successful save', async () => {
      setupMockRequests({
        loadFlow: createTestFlow(),
        saveFlow: { success: true },
      });

      const store = usePersistenceStore();
      await store.initialize();

      const result = await store.saveToBackend();

      expect(result.success).toBe(true);
      expect(store.saveError).toBeNull();
    });

    it('returns issues when save fails', async () => {
      setupMockRequests({
        loadFlow: createTestFlow(),
        saveFlow: {
          success: false,
          issues: [{ severity: 'error', code: 'flow.io', message: 'Permission denied' }],
        },
      });

      const store = usePersistenceStore();
      await store.initialize();

      const result = await store.saveToBackend();

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.issues).toEqual([
        { severity: 'error', code: 'flow.io', message: 'Permission denied' },
      ]);
      expect(store.saveError).toBe('Permission denied');
    });

    it('handles network errors gracefully', async () => {
      setupMockRequests({
        loadFlow: createTestFlow(),
        saveFlow: () => Promise.reject(new Error('Network timeout')),
      });

      const store = usePersistenceStore();
      await store.initialize();

      const result = await store.saveToBackend();

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.issues[0]).toMatchObject({
        severity: 'error',
        code: 'flow.io',
        message: 'Network timeout',
      });
      expect(store.saveError).toBe('Network timeout');
    });

    it('returns an issue when message bus not initialized', async () => {
      const store = usePersistenceStore();
      // Don't call initialize()

      const result = await store.saveToBackend();

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.issues[0]?.message).toBe('Message bus not initialized');
    });
  });

  describe('loadFromBackend', () => {
    it('loads flow into graph store', async () => {
      setupMockRequests({ loadFlow: createTestFlow() });

      const persistenceStore = usePersistenceStore();
      const graphStore = useGraphStore();

      await persistenceStore.initialize();

      expect(graphStore.getNode('node-1' as NodeId)).toBeDefined();
    });

    it('clears UI selection on load', async () => {
      setupMockRequests({ loadFlow: createTestFlow() });

      const persistenceStore = usePersistenceStore();
      const uiStore = useUIStore();

      uiStore.select('some-old-selection');
      await persistenceStore.initialize();

      expect(uiStore.selectedElementId).toBeNull();
    });

    it('sets isDirty to false after load', async () => {
      setupMockRequests({ loadFlow: createTestFlow() });

      const store = usePersistenceStore();
      await store.initialize();

      expect(store.isDirty).toBe(false);
    });

    it('returns error when no flow found', async () => {
      setupMockRequests({ loadFlow: null });

      const store = usePersistenceStore();
      await store.initialize();

      // First load during init returns null
      expect(store.loadError).toBeNull(); // No error set for null flow during init

      // Explicit reload
      const result = await store.loadFromBackend();

      expect(result.success).toBe(false);
      expect(result.error).toBe('No flow found');
    });

    it('handles load errors gracefully', async () => {
      setupMockRequests({
        loadFlow: () => Promise.reject(new Error('File not found')),
      });

      const store = usePersistenceStore();
      await store.initialize();

      expect(store.loadError).toBe('File not found');
    });
  });

  describe('notification handlers', () => {
    it('handles initialState notification', async () => {
      setupMockRequests({ loadFlow: createTestFlow() });

      const store = usePersistenceStore();
      await store.initialize();

      // Find and call the initialState handler
      const initialStateCall = mockOnNotification.mock.calls.find(
        ([event]) => event === 'initialState',
      );
      const handler = initialStateCall?.[1];

      const definitions = [{ type: 'agent', label: 'Agent' }];
      handler?.({ nodeTypeDefinitions: definitions });

      expect(store.nodeTypeDefinitions).toEqual(definitions);
      expect(store.definitionsLoaded).toBe(true);
    });

    it('handles flowSaved notification', async () => {
      setupMockRequests({ loadFlow: createTestFlow() });

      const store = usePersistenceStore();
      await store.initialize();
      store.markDirty();

      // Find and call the flowSaved handler
      const flowSavedCall = mockOnNotification.mock.calls.find(([event]) => event === 'flowSaved');
      const handler = flowSavedCall?.[1];

      const timestamp = '2024-01-15T10:30:00Z';
      handler?.({ timestamp });

      expect(store.isDirty).toBe(false);
      expect(store.lastSavedAt).toEqual(new Date(timestamp));
      expect(store.saveError).toBeNull();
    });

    it('handles flowChanged notification when not dirty', async () => {
      setupMockRequests({ loadFlow: createTestFlow() });

      const persistenceStore = usePersistenceStore();
      const graphStore = useGraphStore();
      const uiStore = useUIStore();

      await persistenceStore.initialize();
      uiStore.select('some-id');

      // Find and call the flowChanged handler
      const flowChangedCall = mockOnNotification.mock.calls.find(
        ([event]) => event === 'flowChanged',
      );
      const handler = flowChangedCall?.[1];

      const newFlow = {
        ...createTestFlow(),
        nodes: { 'external-node': createTestNode('external-node') } as Flow['nodes'],
        edges: {},
      };
      handler?.({ flow: newFlow });

      expect(graphStore.getNode('external-node' as NodeId)).toBeDefined();
      expect(uiStore.selectedElementId).toBeNull();
    });

    it('ignores flowChanged notification when dirty', async () => {
      setupMockRequests({ loadFlow: createTestFlow() });

      const persistenceStore = usePersistenceStore();
      const graphStore = useGraphStore();

      await persistenceStore.initialize();
      persistenceStore.markDirty();

      const flowChangedCall = mockOnNotification.mock.calls.find(
        ([event]) => event === 'flowChanged',
      );
      const handler = flowChangedCall?.[1];

      handler?.({
        flow: {
          ...createTestFlow(),
          nodes: { 'external-node': createTestNode('external-node') } as Flow['nodes'],
          edges: {},
        },
      });

      // Should NOT update because we have unsaved changes
      expect(graphStore.getNode('external-node' as NodeId)).toBeUndefined();
    });
  });

  describe('setCurrentUri', () => {
    function makeSummary(overrides: Partial<CatalogFlowSummary> = {}): CatalogFlowSummary {
      return {
        uri: 'gitlab-catalog://flow/42',
        id: 'gid://gitlab/Ai::Catalog::Item/42',
        name: 'My Catalog Flow',
        description: '',
        public: false,
        updatedAt: '2025-01-01T00:00:00Z',
        projectFullPath: 'group/proj',
        latestVersionName: '1.0.0',
        ...overrides,
      };
    }

    it('stores the catalog summary when switching to a catalog URI', async () => {
      setupMockRequests({ loadFlow: createTestFlow(), saveFlow: { success: true } });

      const store = usePersistenceStore();
      await store.initialize();

      const summary = makeSummary();
      await store.setCurrentUri(summary.uri, summary);

      expect(store.currentUri).toBe(summary.uri);
      expect(store.currentSummary).toEqual(summary);
    });

    it('clears the catalog summary when switching to a non-catalog URI', async () => {
      setupMockRequests({ loadFlow: createTestFlow() });

      const store = usePersistenceStore();
      await store.initialize();
      await store.setCurrentUri('gitlab-catalog://flow/42', makeSummary());
      expect(store.currentSummary).not.toBeNull();

      await store.setCurrentUri('flow://default');

      expect(store.currentSummary).toBeNull();
    });

    it('does not store summary when URI is not a catalog URI', async () => {
      setupMockRequests({ loadFlow: createTestFlow() });

      const store = usePersistenceStore();
      await store.initialize();

      await store.setCurrentUri('flow://other', makeSummary());

      expect(store.currentSummary).toBeNull();
    });
  });

  describe('dispose', () => {
    it('resets isInitialized', async () => {
      setupMockRequests({ loadFlow: createTestFlow() });

      const store = usePersistenceStore();
      await store.initialize();
      expect(store.isInitialized).toBe(true);

      store.dispose();

      expect(store.isInitialized).toBe(false);
    });
  });
});
