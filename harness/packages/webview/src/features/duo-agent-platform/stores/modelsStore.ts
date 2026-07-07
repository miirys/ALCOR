import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { AiModelSelectionOfferedModel } from '@gitlab-org/graphql';

import { AiChatAvailableModels } from '@gitlab-org/lib-duo-agent-platform/webview';
import {
  getDuoAgentPlatformMessageBus,
  DuoAgentPlatformMessageBus,
  disposeDuoAgentPlatformMessageBus,
} from '../services/DuoAgentPlatformMessageBus';

type DisplayModel = {
  name: string;
  provider: string;
  ref: string;
  isDefault: boolean;
  isPinned: boolean;
};

export const useModelsStore = defineStore('models', () => {
  let messageBus: DuoAgentPlatformMessageBus | null = null;

  const isLoading = ref<boolean>(false);
  const defaultModel = ref<AiModelSelectionOfferedModel | null>(null);
  const pinnedModel = ref<AiModelSelectionOfferedModel | null>(null);
  const selectedModelRef = ref<string | null>(null);
  const userModelSwitchingEnabled = ref(false);
  const availableModels = ref<DisplayModel[]>([]);

  const error = ref<string | null>(null);

  const groupedModels = computed(() => {
    const groups = new Map<string, typeof availableModels.value>();
    for (const model of availableModels.value) {
      const group = groups.get(model.provider) ?? [];
      group.push(model);
      groups.set(model.provider, group);
    }
    return groups;
  });

  const hasAvailableModels = computed(() => availableModels.value.length > 0);

  const hasError = computed(() => error.value !== null);

  const isPinned = computed(() => Boolean(pinnedModel.value));

  function initialize(injectedMessageBus?: DuoAgentPlatformMessageBus) {
    if (messageBus) return;

    messageBus = injectedMessageBus ?? getDuoAgentPlatformMessageBus();

    messageBus
      .sendRequest('getPersistedSelectedModel', undefined)
      .then((modelRef) => {
        if (modelRef && !selectedModelRef.value) {
          selectedModelRef.value = modelRef;
        }
        return modelRef;
      })
      .catch(() => undefined);
  }

  function setSelectedModel(modelRef: string | null) {
    if (!messageBus) return;

    if (pinnedModel.value && pinnedModel.value.ref !== modelRef) return;

    selectedModelRef.value = modelRef ?? null;
    messageBus?.sendNotification('persistSelectedModel', { modelRef: selectedModelRef.value });
  }

  async function fetchAvailableModels(rootNamespaceId: string) {
    if (!messageBus) return;
    isLoading.value = true;
    error.value = null;
    try {
      const data = await messageBus.sendRequest('fetchAvailableModels', { rootNamespaceId });
      setAvailableModels(data);
    } catch (err) {
      error.value = `Failed to get available models: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error(error.value);
    } finally {
      isLoading.value = false;
    }
  }

  function setAvailableModels(data: AiChatAvailableModels) {
    defaultModel.value = data.aiChatAvailableModels?.defaultModel ?? null;
    pinnedModel.value = data.aiChatAvailableModels?.pinnedModel ?? null;
    const selectableModels = data.aiChatAvailableModels?.selectableModels ?? [];

    userModelSwitchingEnabled.value = data.userModelSwitchingEnabled;

    availableModels.value = selectableModels.map((model) => {
      const { displayName, provider } = parseModelName(model.name);
      return {
        name: displayName,
        provider,
        ref: model.ref,
        isDefault: model.ref === defaultModel.value?.ref,
        isPinned: model.ref === pinnedModel.value?.ref,
      };
    });

    // Pinned model takes precedence
    if (pinnedModel.value && pinnedModel.value.ref !== selectedModelRef.value) {
      setSelectedModel(pinnedModel.value.ref);
      return;
    }

    // Validate persisted selection is still available
    if (selectedModelRef.value) {
      const stillAvailable = selectableModels.some((m) => m.ref === selectedModelRef.value);
      if (!stillAvailable && defaultModel.value) {
        setSelectedModel(defaultModel.value.ref);
        return;
      }
    }

    if (!selectedModelRef.value && defaultModel.value) {
      setSelectedModel(defaultModel.value.ref);
    }
  }

  // API returns model names in the format "Model Name - Provider" (e.g. "Claude 3.5 Sonnet - Anthropic").
  // We split on the last " - " and reformat as "Provider / Model Name" for display.
  function parseModelName(name: string): { displayName: string; provider: string } {
    const separatorIndex = name.lastIndexOf(' - ');
    if (separatorIndex === -1) return { displayName: name, provider: '' };
    const provider = name.slice(separatorIndex + 3);
    return { displayName: `${provider} / ${name.slice(0, separatorIndex)}`, provider };
  }

  function $reset() {
    messageBus = null;
    isLoading.value = false;
    defaultModel.value = null;
    pinnedModel.value = null;
    selectedModelRef.value = null;
    userModelSwitchingEnabled.value = false;
    availableModels.value = [];
    error.value = null;
  }

  function dispose() {
    disposeDuoAgentPlatformMessageBus();
    messageBus = null;
  }

  return {
    initialize,
    hasError,
    error,
    $reset,
    dispose,
    isLoading,

    userModelSwitchingEnabled,
    availableModels,
    groupedModels,
    hasAvailableModels,
    isPinned,
    selectedModelRef,

    setSelectedModel,
    fetchAvailableModels,
  };
});
