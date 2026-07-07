import { defineStore } from 'pinia';
import { ref } from 'vue';
import { isCatalogFlowUri } from '@gitlab-org/flow-builder/flow';
import { FlowValidationCode } from '../types';
import type {
  CatalogFlowSummary,
  FlowValidationIssue,
  NodeTypeDefinition,
  RuntimeProvidedVariableDefinition,
  ToolDefinition,
} from '../types';
import {
  disposeFlowMessageBus,
  getFlowMessageBus,
  type FlowMessageBus,
} from '../services/FlowMessageBus';
import { useGraphStore } from './graphStore';
import { useUIStore } from './uiStore';
import { useExecutionStore } from './executionStore';
import { useSessionStore } from './sessionStore';

export const usePersistenceStore = defineStore('persistence', () => {
  const graphStore = useGraphStore();
  const uiStore = useUIStore();

  const currentUri = ref<string>('flow://default');
  const currentSummary = ref<CatalogFlowSummary | null>(null);
  const isDirty = ref(false);
  const lastSavedAt = ref<Date | null>(null);
  const saveError = ref<string | null>(null);
  const loadError = ref<string | null>(null);
  const nodeTypeDefinitions = ref<NodeTypeDefinition[]>([]);
  const toolDefinitions = ref<ToolDefinition[]>([]);
  const runtimeProvidedVariableDefinitions = ref<RuntimeProvidedVariableDefinition[]>([]);
  const definitionsLoaded = ref(false);
  const isInitialized = ref(false);

  let messageBus: FlowMessageBus | null = null;

  async function initialize(): Promise<void> {
    if (messageBus) return;

    const params = new URLSearchParams(window.location.search);
    const uriParam = params.get('uri');
    if (uriParam) {
      currentUri.value = uriParam;
    }

    messageBus = getFlowMessageBus();

    const executionStore = useExecutionStore();
    executionStore.initializeListeners();

    messageBus.onNotification(
      'initialState',
      ({
        nodeTypeDefinitions: nodeDefs,
        toolDefinitions: toolDefs,
        runtimeProvidedVariableDefinitions: runtimeDefs,
      }) => {
        nodeTypeDefinitions.value = nodeDefs;
        toolDefinitions.value = toolDefs;
        runtimeProvidedVariableDefinitions.value = runtimeDefs;
        definitionsLoaded.value = true;
      },
    );

    messageBus.onNotification('flowSaved', ({ timestamp }) => {
      isDirty.value = false;
      lastSavedAt.value = new Date(timestamp);
      saveError.value = null;
    });

    messageBus.onNotification('flowChanged', ({ flow: changedFlow }) => {
      if (!isDirty.value) {
        graphStore.loadFlow(changedFlow);
        uiStore.clearSelection();
      }
    });

    const sessionStore = useSessionStore();

    messageBus.sendNotification('appReady', undefined);
    await loadFromBackend();
    await Promise.all([executionStore.fetchContext(), sessionStore.fetchSessionInfo()]);
    isInitialized.value = true;
  }

  function dispose(): void {
    disposeFlowMessageBus();
    messageBus = null;
    isInitialized.value = false;
  }

  type SaveResult = { success: true } | { success: false; issues: FlowValidationIssue[] };

  async function saveToBackend(): Promise<SaveResult> {
    if (!messageBus) {
      return {
        success: false,
        issues: [
          {
            severity: 'error',
            code: FlowValidationCode.Io,
            message: 'Message bus not initialized',
          },
        ],
      };
    }

    try {
      saveError.value = null;
      const result = await messageBus.sendRequest('saveFlow', {
        flow: graphStore.flow,
        uri: currentUri.value,
      });

      if (!result.success) {
        saveError.value = result.issues[0]?.message ?? null;
        return { success: false, issues: result.issues };
      }
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      saveError.value = msg;
      return {
        success: false,
        issues: [{ severity: 'error', code: FlowValidationCode.Io, message: msg }],
      };
    }
  }

  async function loadFromBackend(): Promise<{ success: boolean; error?: string }> {
    if (!messageBus) {
      return { success: false, error: 'Message bus not initialized' };
    }

    try {
      loadError.value = null;
      const loadedFlow = await messageBus.sendRequest('loadFlow', {
        uri: currentUri.value,
      });

      if (loadedFlow) {
        graphStore.loadFlow(loadedFlow);
        uiStore.clearSelection();
        isDirty.value = false;
        return { success: true };
      }
      return { success: false, error: 'No flow found' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      loadError.value = msg;
      return { success: false, error: msg };
    }
  }

  function markDirty(): void {
    isDirty.value = true;
  }

  function markClean(): void {
    isDirty.value = false;
  }

  /**
   * Switch the active flow URI and reload from the backend. Used when the
   * user picks a different flow from the catalog or creates a new one.
   *
   * Pass `summary` when switching to a catalog flow to retain its display
   * metadata (name, project path) for indicators and tooltips. The summary
   * is cleared automatically if the new URI is not a catalog URI.
   *
   * Caller is responsible for confirming any unsaved changes — this method
   * always discards the in-memory graph in favour of the backend's copy.
   */
  async function setCurrentUri(
    uri: string,
    summary?: CatalogFlowSummary,
  ): Promise<{ success: boolean; error?: string }> {
    currentUri.value = uri;
    if (summary && isCatalogFlowUri(uri)) {
      currentSummary.value = summary;
    } else if (!isCatalogFlowUri(uri)) {
      currentSummary.value = null;
    }
    return loadFromBackend();
  }

  return {
    currentUri,
    currentSummary,
    isDirty,
    lastSavedAt,
    saveError,
    loadError,
    nodeTypeDefinitions,
    toolDefinitions,
    runtimeProvidedVariableDefinitions,
    definitionsLoaded,
    isInitialized,
    initialize,
    dispose,
    saveToBackend,
    loadFromBackend,
    setCurrentUri,
    markDirty,
    markClean,
  };
});
