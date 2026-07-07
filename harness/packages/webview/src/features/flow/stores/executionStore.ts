import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ExecutionEvent, ExecutionContext, NodeEvent, NodeId } from '../types';
import { buildExecutionTrace } from '../utils/checkpoint';
import { parseNodeEvents, foldNodeEvents } from '../utils/nodeLifecycle';
import { toComponentName } from '../utils/flow';
import { getFlowMessageBus } from '../services/FlowMessageBus';
import { usePersistenceStore } from './persistenceStore';
import { useGraphStore } from './graphStore';

export const useExecutionStore = defineStore('execution', () => {
  const messageBus = getFlowMessageBus();
  const persistenceStore = usePersistenceStore();
  const graphStore = useGraphStore();

  // State
  const isPanelOpen = ref(false);
  const isExecuting = ref(false);
  const executionId = ref<string | null>(null);
  const executionContext = ref<Record<string, string>>({});
  const events = ref<ExecutionEvent[]>([]);
  // Accumulated node-lifecycle log. The backend sends events incrementally per
  // checkpoint, so we append each batch on arrival rather than reparsing.
  const nodeEvents = ref<NodeEvent[]>([]);
  const status = ref<'idle' | 'running' | 'completed' | 'failed' | 'stopped'>('idle');
  const error = ref<string | null>(null);
  const context = ref<ExecutionContext | null>(null);

  // Computed
  const goal = computed(() => executionContext.value.goal || null);
  const trace = computed(() =>
    buildExecutionTrace(events.value, status.value, goal.value, error.value),
  );

  // Runtime → graph join: keyed on toComponentName(node.label) because that is
  // what the V1 converter writes at save time. sourceComponentName is set only
  // on load and goes stale after a rename — deliberately not used here.
  const nodesByComponentName = computed<Map<string, NodeId>>(() => {
    const map = new Map<string, NodeId>();
    for (const node of graphStore.nodes) {
      map.set(toComponentName(node.label), node.id);
    }
    return map;
  });

  const lifecycle = computed(() => foldNodeEvents(nodeEvents.value));

  function componentsToNodeIds(components: Set<string>): Set<NodeId> {
    const byName = nodesByComponentName.value;
    const ids = new Set<NodeId>();
    for (const component of components) {
      const id = byName.get(component);
      if (id) ids.add(id);
    }
    return ids;
  }

  // NodeIds currently executing (possibly several — parallel branches) and every
  // NodeId that has run, derived by folding the accumulated node-event log. This
  // supersedes the earlier ui_chat_log-derived heuristic: node events cover
  // silent nodes (routers, deterministic steps) and true concurrency.
  const activeNodeIds = computed(() => componentsToNodeIds(lifecycle.value.activeComponents));
  const visitedNodeIds = computed(() => componentsToNodeIds(lifecycle.value.visitedComponents));

  async function fetchContext() {
    try {
      context.value = await messageBus.sendRequest('getExecutionContext', undefined);
    } catch {
      // Context is optional. Keep try/catch to prevent unhandled rejection warnings
      context.value = null;
    }
  }

  /**
   * Start execution. Caller is responsible for ensuring flow is saved.
   */
  async function startExecution(inputContext: Record<string, string>) {
    isPanelOpen.value = true;
    events.value = [];
    nodeEvents.value = [];
    error.value = null;
    status.value = 'running';
    isExecuting.value = true;
    executionContext.value = inputContext;

    try {
      const result = await messageBus.sendRequest('executeFlow', {
        uri: persistenceStore.currentUri,
        context: inputContext,
      });

      if (!result.success) {
        error.value = result.error;
        status.value = 'failed';
        isExecuting.value = false;
        return { success: false };
      }

      executionId.value = result.executionId;
      return { success: true };
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error';
      status.value = 'failed';
      isExecuting.value = false;
      return { success: false };
    }
  }

  async function stopExecution() {
    if (!executionId.value) return;

    try {
      await messageBus.sendRequest('cancelExecution', { executionId: executionId.value });
      status.value = 'stopped';
      isExecuting.value = false;
    } catch (e) {
      error.value = `Failed to cancel execution: ${e instanceof Error ? e.message : 'Unknown error'}`;
      status.value = 'failed';
      isExecuting.value = false;
    }
  }

  function togglePanel() {
    isPanelOpen.value = !isPanelOpen.value;
  }

  function clear() {
    events.value = [];
    nodeEvents.value = [];
    status.value = 'idle';
    error.value = null;
    executionId.value = null;
    executionContext.value = {};
  }

  function initializeListeners() {
    messageBus.onNotification('executionStarted', ({ executionId: id, context: ctx }) => {
      executionId.value = id;
      executionContext.value = ctx;
      isExecuting.value = true;
      status.value = 'running';
      isPanelOpen.value = true;
    });

    messageBus.onNotification('executionUpdate', ({ executionId: id, event }) => {
      if (executionId.value === id) {
        events.value.push(event);
        nodeEvents.value.push(...parseNodeEvents(event.checkpoint));
      }
    });

    messageBus.onNotification('executionCompleted', ({ executionId: id, status: s, error: e }) => {
      if (executionId.value === id) {
        isExecuting.value = false;
        status.value = s;
        if (e) error.value = e;
      }
    });
  }

  return {
    // State
    isPanelOpen,
    isExecuting,
    executionId,
    executionContext,
    goal,
    events,
    status,
    error,
    context,
    trace,
    activeNodeIds,
    visitedNodeIds,

    // Actions
    fetchContext,
    startExecution,
    stopExecution,
    togglePanel,
    clear,
    initializeListeners,
  };
});
