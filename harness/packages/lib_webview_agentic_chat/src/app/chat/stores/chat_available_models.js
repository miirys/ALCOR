import { ifVersionGte, InstanceFeatureFlags } from '@gitlab-org/core';
import { defineStore } from 'pinia';

export const useChatAvailableModelsStore = defineStore('chatAvailableModels', {
  state: () => ({
    defaultModel: null,
    instanceVersion: null,
    pinnedModel: null,
    selectableModels: [],
    selectedModelRef: null,
    userModelSwitchingEnabled: false,
  }),
  getters: {
    chatAvailableModels: (state) =>
      state.selectableModels.map((model) => ({
        name: model.name,
        ref: model.ref,
        isDefault: model.ref === state.defaultModel?.ref,
        isPinned: model.ref === state.pinnedModel?.ref,
        isSelected: state.selectedModelRef && model.ref === state.selectedModelRef,
      })),
  },
  actions: {
    fetchChatAvailableModels(rootNamespaceId) {
      this.sendGraphqlRequest({
        eventName: 'setChatAvailableModels',
        operationName: 'aiChatAvailableModels',
        variables: {
          rootNamespaceId,
        },
      });
    },
    loadPersistedSelectedModel() {
      this.sendNotification('getPersistedSelectedModel');
    },
    setPersistedSelectedModel(modelRef) {
      if (modelRef && !this.selectedModelRef) {
        this.selectedModelRef = modelRef;
      }
    },
    setChatAvailableModels(data) {
      this.defaultModel = data?.aiChatAvailableModels?.defaultModel;
      this.instanceVersion = data?.metadata?.version;
      this.pinnedModel = data?.aiChatAvailableModels?.pinnedModel;
      this.selectableModels = data?.aiChatAvailableModels?.selectableModels ?? [];

      this.userModelSwitchingEnabled =
        this.instanceVersion &&
        ifVersionGte(
          this.instanceVersion,
          '18.5.0',
          () => true,
          () =>
            data?.metadata?.featureFlags?.find(
              (flag) => flag.name === InstanceFeatureFlags.UserModelSwitching,
            )?.enabled ?? false,
        );

      if (this.pinnedModel && this.pinnedModel.ref !== this.selectedModelRef) {
        this.setSelectedModel(this.pinnedModel.ref);
      }

      // Validate persisted selection is still available
      if (this.selectedModelRef) {
        const stillAvailable = this.selectableModels.some(
          (model) => model.ref === this.selectedModelRef,
        );
        if (!stillAvailable && this.defaultModel) {
          this.setSelectedModel(this.defaultModel.ref);
        }
      }

      if (!this.selectedModelRef && this.defaultModel) {
        this.setSelectedModel(this.defaultModel.ref);
      }
    },
    setSelectedModel(ref) {
      if (this.pinnedModel && this.pinnedModel.ref !== ref) {
        return;
      }

      this.selectedModelRef = ref ?? null;
      this.sendNotification('persistSelectedModel', { modelRef: this.selectedModelRef });
    },
  },
  events: {
    setChatAvailableModels: 'setChatAvailableModels',
    setSelectedModel: 'setSelectedModel',
    setPersistedSelectedModel: 'setPersistedSelectedModel',
  },
});
