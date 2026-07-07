import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { ExecutionEvent, ExecutionContext, Flow, FlowId, NodeId } from '../types';
import { useExecutionStore } from './executionStore';
import { useGraphStore } from './graphStore';
import { usePersistenceStore } from '@/features/flow/stores/persistenceStore.ts';

// ============================================================================
// Mocks
// ============================================================================

const mockSendRequest = vi.fn();
const mockSendNotification = vi.fn();
const mockOnNotification = vi.fn();

vi.mock('../services/FlowMessageBus', () => ({
  getFlowMessageBus: () => ({
    sendRequest: mockSendRequest,
    sendNotification: mockSendNotification,
    onNotification: mockOnNotification,
  }),
}));

vi.mock('./flowStore', () => ({
  useFlowStore: () => ({
    isDirty: false,
    currentUri: 'flow://test',
    saveToBackend: vi.fn().mockResolvedValue({ success: true }),
  }),
}));

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_FLOW_ID = 'flow://test-flow';

function createTestEvent(overrides: Partial<ExecutionEvent> = {}): ExecutionEvent {
  return {
    checkpoint: '{}',
    errors: [],
    workflowGoal: 'Test goal',
    workflowStatus: 'RUNNING',
    ...overrides,
  };
}

function createTestContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    projectPath: 'gitlab-org/gitlab',
    namespacePath: 'gitlab-org',
    isReady: true,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('executionStore', () => {
  let store: ReturnType<typeof useExecutionStore>;
  let persistenceStore: ReturnType<typeof usePersistenceStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    persistenceStore = usePersistenceStore();
    persistenceStore.currentUri = TEST_FLOW_ID;

    store = useExecutionStore();
  });

  // --------------------------------------------------------------------------
  // Initial State
  // --------------------------------------------------------------------------

  describe('initial state', () => {
    it('starts idle with panel closed', () => {
      expect(store.isPanelOpen).toBe(false);
      expect(store.isExecuting).toBe(false);
      expect(store.status).toBe('idle');
      expect(store.executionId).toBeNull();
      expect(store.events).toEqual([]);
      expect(store.error).toBeNull();
      expect(store.context).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Panel Management
  // --------------------------------------------------------------------------

  describe('togglePanel', () => {
    it('toggles panel visibility', () => {
      expect(store.isPanelOpen).toBe(false);

      store.togglePanel();
      expect(store.isPanelOpen).toBe(true);

      store.togglePanel();
      expect(store.isPanelOpen).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Execution Context
  // --------------------------------------------------------------------------

  describe('fetchContext', () => {
    it('fetches and stores execution context', async () => {
      const context = createTestContext();
      mockSendRequest.mockResolvedValueOnce(context);

      await store.fetchContext();

      expect(mockSendRequest).toHaveBeenCalledWith('getExecutionContext', undefined);
      expect(store.context).toEqual(context);
    });

    it('handles fetch failure silently', async () => {
      mockSendRequest.mockRejectedValueOnce(new Error('Network error'));

      await store.fetchContext();

      expect(store.context).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Start Execution
  // --------------------------------------------------------------------------

  describe('startExecution', () => {
    it('sends execute request with context inputs', async () => {
      mockSendRequest.mockResolvedValueOnce({
        success: true,
        executionId: 'exec-123',
      });

      const result = await store.startExecution({ goal: 'test goal', project_id: '42' });

      expect(result.success).toBe(true);
      expect(mockSendRequest).toHaveBeenCalledWith('executeFlow', {
        uri: TEST_FLOW_ID,
        context: { goal: 'test goal', project_id: '42' },
      });
    });

    it('updates state on successful start', async () => {
      mockSendRequest.mockResolvedValueOnce({
        success: true,
        executionId: 'exec-123',
      });

      await store.startExecution({ goal: 'test' });

      expect(store.isPanelOpen).toBe(true);
      expect(store.isExecuting).toBe(true);
      expect(store.status).toBe('running');
      expect(store.executionId).toBe('exec-123');
      expect(store.executionContext).toEqual({ goal: 'test' });
    });

    it('clears previous state before starting', async () => {
      store.events.push(createTestEvent());
      store.error = 'previous error';

      mockSendRequest.mockResolvedValueOnce({
        success: true,
        executionId: 'exec-456',
      });

      await store.startExecution({ goal: 'fresh start' });

      expect(store.events).toEqual([]);
      expect(store.error).toBeNull();
    });

    it('handles execution failure response', async () => {
      mockSendRequest.mockResolvedValueOnce({
        success: false,
        error: 'Flow validation failed',
      });

      const result = await store.startExecution({ goal: 'fail' });

      expect(result.success).toBe(false);
      expect(store.status).toBe('failed');
      expect(store.error).toBe('Flow validation failed');
      expect(store.isExecuting).toBe(false);
    });

    it('handles network error', async () => {
      mockSendRequest.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await store.startExecution({ goal: 'timeout' });

      expect(result.success).toBe(false);
      expect(store.status).toBe('failed');
      expect(store.error).toBe('Network timeout');
      expect(store.isExecuting).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Stop Execution
  // --------------------------------------------------------------------------

  describe('stopExecution', () => {
    it('sends cancel request for active execution', async () => {
      store.executionId = 'exec-to-stop';
      store.isExecuting = true;
      store.status = 'running';
      mockSendRequest.mockResolvedValueOnce({ success: true });

      await store.stopExecution();

      expect(mockSendRequest).toHaveBeenCalledWith('cancelExecution', {
        executionId: 'exec-to-stop',
      });
      expect(store.status).toBe('stopped');
      expect(store.isExecuting).toBe(false);
    });

    it('no-op when no execution running', async () => {
      store.executionId = null;

      await store.stopExecution();

      expect(mockSendRequest).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Clear State
  // --------------------------------------------------------------------------

  describe('clear', () => {
    it('resets all execution state to initial values', () => {
      // Set up dirty state
      store.executionId = 'exec-123';
      store.isExecuting = true;
      store.status = 'running';
      store.events = [createTestEvent()];
      store.error = 'some error';
      store.executionContext = { goal: 'old' };

      store.clear();

      expect(store.executionId).toBeNull();
      expect(store.status).toBe('idle');
      expect(store.events).toEqual([]);
      expect(store.error).toBeNull();
      expect(store.executionContext).toEqual({});
    });
  });

  // --------------------------------------------------------------------------
  // Notification Handlers
  // --------------------------------------------------------------------------

  describe('notification handlers', () => {
    let handlers: Record<string, Function>;

    beforeEach(() => {
      handlers = {};
      mockOnNotification.mockImplementation((event: string, handler: Function) => {
        handlers[event] = handler;
      });
      store.initializeListeners();
    });

    it('registers all required notification handlers', () => {
      expect(handlers.executionStarted).toBeDefined();
      expect(handlers.executionUpdate).toBeDefined();
      expect(handlers.executionCompleted).toBeDefined();
    });

    describe('executionStarted', () => {
      it('updates state when execution starts externally', () => {
        handlers.executionStarted!({
          executionId: 'started-123',
          context: { goal: 'from backend' },
        });

        expect(store.executionId).toBe('started-123');
        expect(store.executionContext).toEqual({ goal: 'from backend' });
        expect(store.isExecuting).toBe(true);
        expect(store.status).toBe('running');
        expect(store.isPanelOpen).toBe(true);
      });
    });

    describe('executionUpdate', () => {
      it('appends event for matching execution', () => {
        store.executionId = 'exec-123';
        const event = createTestEvent({
          checkpoint: '{"step": 1}',
          workflowStatus: 'RUNNING',
          workflowGoal: 'Process data',
        });

        handlers.executionUpdate!({ executionId: 'exec-123', event });

        expect(store.events).toHaveLength(1);
        expect(store.events[0]).toEqual(event);
      });

      it('accumulates multiple events', () => {
        store.executionId = 'exec-123';

        handlers.executionUpdate!({
          executionId: 'exec-123',
          event: createTestEvent({ workflowStatus: 'RUNNING' }),
        });
        handlers.executionUpdate!({
          executionId: 'exec-123',
          event: createTestEvent({ workflowStatus: 'FINISHED' }),
        });

        expect(store.events).toHaveLength(2);
      });

      it('ignores events for different execution', () => {
        store.executionId = 'exec-123';

        handlers.executionUpdate!({
          executionId: 'different-exec',
          event: createTestEvent(),
        });

        expect(store.events).toEqual([]);
      });
    });

    describe('executionCompleted', () => {
      beforeEach(() => {
        store.executionId = 'exec-123';
        store.isExecuting = true;
        store.status = 'running';
      });

      it('handles successful completion', () => {
        handlers.executionCompleted!({
          executionId: 'exec-123',
          status: 'completed',
        });

        expect(store.isExecuting).toBe(false);
        expect(store.status).toBe('completed');
        expect(store.error).toBeNull();
      });

      it('handles failed completion with error', () => {
        handlers.executionCompleted!({
          executionId: 'exec-123',
          status: 'failed',
          error: 'Agent crashed',
        });

        expect(store.isExecuting).toBe(false);
        expect(store.status).toBe('failed');
        expect(store.error).toBe('Agent crashed');
      });

      it('handles stopped completion', () => {
        handlers.executionCompleted!({
          executionId: 'exec-123',
          status: 'stopped',
        });

        expect(store.isExecuting).toBe(false);
        expect(store.status).toBe('stopped');
      });

      it('ignores completion for different execution', () => {
        handlers.executionCompleted!({
          executionId: 'different',
          status: 'completed',
        });

        expect(store.isExecuting).toBe(true);
        expect(store.status).toBe('running');
      });
    });
  });

  // --------------------------------------------------------------------------
  // Computed Properties
  // --------------------------------------------------------------------------

  describe('computed: goal', () => {
    it('extracts goal from execution context', () => {
      store.executionContext = { goal: 'My Goal', project_id: '123' };

      expect(store.goal).toBe('My Goal');
    });

    it('returns null when no goal in context', () => {
      store.executionContext = { project_id: '123' };

      expect(store.goal).toBeNull();
    });

    it('returns null when context is empty', () => {
      store.executionContext = {};

      expect(store.goal).toBeNull();
    });
  });

  describe('computed: trace', () => {
    it('builds trace from execution events', () => {
      store.status = 'completed';
      store.executionContext = { goal: 'Test Goal' };
      store.events = [
        createTestEvent({
          checkpoint: JSON.stringify({
            channel_values: {
              ui_chat_log: [
                {
                  message_type: 'agent',
                  content: 'Processing request',
                  timestamp: '2024-01-01T00:00:00Z',
                  status: 'success',
                },
                {
                  message_type: 'tool',
                  content: 'Called read_file',
                  timestamp: '2024-01-01T00:00:01Z',
                  status: 'success',
                  tool_info: { name: 'read_file', args: { path: 'README.md' } },
                },
              ],
            },
          }),
          workflowStatus: 'FINISHED',
        }),
      ];

      const { trace } = store;

      expect(trace.status).toBe('completed');
      expect(trace.goal).toBe('Test Goal');
      expect(trace.messages).toHaveLength(2);
      expect(trace.messages[0]).toMatchObject({
        type: 'agent',
        content: 'Processing request',
      });
      expect(trace.messages[1]).toMatchObject({
        type: 'tool',
        content: 'Called read_file',
        toolInfo: { name: 'read_file', args: { path: 'README.md' } },
      });
    });

    it('returns empty trace when no events', () => {
      store.status = 'idle';
      store.events = [];

      const { trace } = store;

      expect(trace.messages).toEqual([]);
      expect(trace.stats.totalMessages).toBe(0);
    });

    it('includes error in trace', () => {
      store.status = 'failed';
      store.error = 'Execution failed';
      store.events = [];

      const { trace } = store;

      expect(trace.error).toBe('Execution failed');
    });
  });

  // --------------------------------------------------------------------------
  // Canvas overlay: runtime component_name → NodeId join
  // --------------------------------------------------------------------------

  describe('canvas overlay (node lifecycle → NodeId)', () => {
    let graphStore: ReturnType<typeof useGraphStore>;
    let handlers: Record<string, Function>;

    const PLANNER_ID = 'planner-uuid' as NodeId;
    const RESEARCHER_ID = 'researcher-uuid' as NodeId;

    function loadFlowWith(nodes: { id: NodeId; label: string; sourceComponentName?: string }[]) {
      const flow: Flow = {
        id: 'test-flow' as FlowId,
        entryPoint: nodes[0]?.id ?? null,
        nodes: Object.fromEntries(
          nodes.map((n) => [
            n.id,
            {
              id: n.id,
              label: n.label,
              type: 'agent',
              position: { x: 0, y: 0 },
              config: {},
              ...(n.sourceComponentName ? { sourceComponentName: n.sourceComponentName } : {}),
            },
          ]),
        ),
        edges: {},
        inputs: [],
      };
      graphStore.loadFlow(flow);
    }

    // Deliver one incremental batch of node-lifecycle events the way the backend
    // does — through the real notification path, so parsing and accumulation are
    // exercised, not just the fold.
    function sendNodeEvents(nodeEvents: { run_id: string; component: string; phase: string }[]) {
      handlers.executionUpdate!({
        executionId: 'exec-1',
        event: createTestEvent({
          checkpoint: JSON.stringify({
            channel_values: { node_events: nodeEvents, status: 'running' },
          }),
        }),
      });
    }

    beforeEach(() => {
      graphStore = useGraphStore();
      loadFlowWith([
        { id: PLANNER_ID, label: 'Planner' },
        { id: RESEARCHER_ID, label: 'Researcher' },
      ]);
      handlers = {};
      mockOnNotification.mockImplementation((event: string, handler: Function) => {
        handlers[event] = handler;
      });
      store.initializeListeners();
      store.executionId = 'exec-1';
    });

    it('marks a started component active on its canvas node', () => {
      sendNodeEvents([{ run_id: 'r1', component: 'researcher', phase: 'started' }]);

      expect(store.activeNodeIds).toEqual(new Set([RESEARCHER_ID]));
      expect(store.visitedNodeIds).toEqual(new Set([RESEARCHER_ID]));
    });

    it('clears the active node when its run ends, keeping it visited', () => {
      sendNodeEvents([{ run_id: 'r1', component: 'researcher', phase: 'started' }]);
      sendNodeEvents([{ run_id: 'r1', component: 'researcher', phase: 'ended' }]);

      expect(store.activeNodeIds).toEqual(new Set());
      expect(store.visitedNodeIds).toEqual(new Set([RESEARCHER_ID]));
    });

    it('reports multiple concurrently-active nodes', () => {
      sendNodeEvents([
        { run_id: 'r1', component: 'planner', phase: 'started' },
        { run_id: 'r2', component: 'researcher', phase: 'started' },
      ]);

      expect(store.activeNodeIds).toEqual(new Set([PLANNER_ID, RESEARCHER_ID]));
    });

    it('accumulates events across incremental checkpoints', () => {
      sendNodeEvents([{ run_id: 'r1', component: 'planner', phase: 'started' }]);
      sendNodeEvents([
        { run_id: 'r1', component: 'planner', phase: 'ended' },
        { run_id: 'r2', component: 'researcher', phase: 'started' },
      ]);

      expect(store.activeNodeIds).toEqual(new Set([RESEARCHER_ID]));
      expect(store.visitedNodeIds).toEqual(new Set([PLANNER_ID, RESEARCHER_ID]));
    });

    it('clears active on an errored run but keeps it visited', () => {
      sendNodeEvents([{ run_id: 'r1', component: 'researcher', phase: 'started' }]);
      sendNodeEvents([{ run_id: 'r1', component: 'researcher', phase: 'errored' }]);

      expect(store.activeNodeIds).toEqual(new Set());
      expect(store.visitedNodeIds).toEqual(new Set([RESEARCHER_ID]));
    });

    it('ignores components that are not on the canvas', () => {
      // e.g. an internal supervisor/router the graph does not represent
      sendNodeEvents([{ run_id: 'r1', component: 'internal_supervisor', phase: 'started' }]);

      expect(store.activeNodeIds).toEqual(new Set());
      expect(store.visitedNodeIds).toEqual(new Set());
    });

    it('joins on the current label, not the stale sourceComponentName', () => {
      // Regression: a node loaded from V1 keeps its original sourceComponentName
      // in memory even after the user renames it. On save the V1 file is written
      // under the new label-derived name, so the runtime emits events under that
      // new name. Joining on sourceComponentName would silently miss this node;
      // we join on toComponentName(label) so the renamed node still lights up.
      loadFlowWith([
        {
          id: 'reviewer-uuid' as NodeId,
          label: 'Code Reviewer', // renamed in the UI
          sourceComponentName: 'code_analyzer', // stale: from initial load
        },
      ]);
      sendNodeEvents([{ run_id: 'r1', component: 'code_reviewer', phase: 'started' }]);

      expect(store.activeNodeIds).toEqual(new Set(['reviewer-uuid' as NodeId]));
      expect(store.visitedNodeIds).toEqual(new Set(['reviewer-uuid' as NodeId]));
    });

    it('clears node-lifecycle overlay state before starting a new execution', async () => {
      // Stale lifecycle events from a previous run would otherwise leak into the
      // next run's overlay and light up nodes that have not executed yet.
      sendNodeEvents([{ run_id: 'r1', component: 'planner', phase: 'started' }]);
      expect(store.activeNodeIds).toEqual(new Set([PLANNER_ID]));

      mockSendRequest.mockResolvedValueOnce({ success: true, executionId: 'exec-2' });
      await store.startExecution({ goal: 'second run' });

      expect(store.activeNodeIds).toEqual(new Set());
      expect(store.visitedNodeIds).toEqual(new Set());
    });
  });
});
