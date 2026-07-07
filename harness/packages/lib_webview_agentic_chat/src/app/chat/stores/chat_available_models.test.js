import { createPinia, setActivePinia } from 'pinia';
import {
  mockMessageBusBridge,
  mockWorkflowStoreEvents,
} from '../../test_utils/mock_workflow_store_plugin';
import { useChatAvailableModelsStore } from './chat_available_models';

const defaultModel = { name: 'Default Model', ref: 'default-model-ref' };
const alternateModel = { name: 'Alternate Model', ref: 'alternate-model-ref' };
const pinnedModel = { name: 'Pinned Model', ref: 'pinned-model-ref' };

const buildAvailableModelsResponse = ({
  selectableModels = [defaultModel, alternateModel],
  defaultModelOverride = defaultModel,
  pinnedModelOverride = null,
  version = '18.5.0',
  featureFlags = [],
} = {}) => ({
  aiChatAvailableModels: {
    defaultModel: defaultModelOverride,
    pinnedModel: pinnedModelOverride,
    selectableModels,
  },
  metadata: {
    version,
    featureFlags,
  },
});

describe('useChatAvailableModelsStore', () => {
  let store;

  beforeEach(() => {
    const pinia = createPinia();
    pinia.use(mockWorkflowStoreEvents);
    setActivePinia(pinia);
    store = useChatAvailableModelsStore();
    jest.clearAllMocks();
  });

  describe('loadPersistedSelectedModel', () => {
    it('sends getPersistedSelectedModel notification', () => {
      store.loadPersistedSelectedModel();

      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith(
        'getPersistedSelectedModel',
      );
    });
  });

  describe('setPersistedSelectedModel', () => {
    describe('when no model is currently selected', () => {
      it('sets the persisted model ref', () => {
        store.setPersistedSelectedModel('alternate-model-ref');

        expect(store.selectedModelRef).toBe('alternate-model-ref');
      });
    });

    describe('when a model is already selected', () => {
      beforeEach(() => {
        store.selectedModelRef = 'default-model-ref';
      });

      it('does not overwrite the current selection', () => {
        store.setPersistedSelectedModel('alternate-model-ref');

        expect(store.selectedModelRef).toBe('default-model-ref');
      });
    });

    describe('when modelRef is null', () => {
      it('does not change the selection', () => {
        store.selectedModelRef = 'default-model-ref';

        store.setPersistedSelectedModel(null);

        expect(store.selectedModelRef).toBe('default-model-ref');
      });
    });

    describe('when modelRef is null and no model is selected', () => {
      it('keeps selectedModelRef as null', () => {
        store.setPersistedSelectedModel(null);

        expect(store.selectedModelRef).toBeNull();
      });
    });
  });

  describe('setSelectedModel', () => {
    it('updates selectedModelRef and persists the selection', () => {
      store.setSelectedModel('alternate-model-ref');

      expect(store.selectedModelRef).toBe('alternate-model-ref');
      expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('persistSelectedModel', {
        modelRef: 'alternate-model-ref',
      });
    });

    describe('when a pinned model exists', () => {
      beforeEach(() => {
        store.pinnedModel = pinnedModel;
      });

      it('does not allow selecting a different model', () => {
        store.setSelectedModel('alternate-model-ref');

        expect(store.selectedModelRef).toBeNull();
        expect(mockMessageBusBridge.sendNotification).not.toHaveBeenCalledWith(
          'persistSelectedModel',
          expect.anything(),
        );
      });

      it('allows selecting the pinned model', () => {
        store.setSelectedModel('pinned-model-ref');

        expect(store.selectedModelRef).toBe('pinned-model-ref');
        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('persistSelectedModel', {
          modelRef: 'pinned-model-ref',
        });
      });
    });

    describe('when ref is null', () => {
      it('clears the selection and persists null', () => {
        store.selectedModelRef = 'alternate-model-ref';

        store.setSelectedModel(null);

        expect(store.selectedModelRef).toBeNull();
        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('persistSelectedModel', {
          modelRef: null,
        });
      });
    });
  });

  describe('setChatAvailableModels', () => {
    describe('when no model is selected', () => {
      it('falls back to the default model', () => {
        store.setChatAvailableModels(buildAvailableModelsResponse());

        expect(store.selectedModelRef).toBe('default-model-ref');
      });
    });

    describe('when a persisted model is still available', () => {
      beforeEach(() => {
        store.selectedModelRef = 'alternate-model-ref';
      });

      it('keeps the persisted selection', () => {
        store.setChatAvailableModels(buildAvailableModelsResponse());

        expect(store.selectedModelRef).toBe('alternate-model-ref');
      });
    });

    describe('when a persisted model is no longer available', () => {
      beforeEach(() => {
        store.selectedModelRef = 'removed-model-ref';
      });

      it('falls back to the default model', () => {
        store.setChatAvailableModels(buildAvailableModelsResponse());

        expect(store.selectedModelRef).toBe('default-model-ref');
      });

      it('persists the fallback selection', () => {
        store.setChatAvailableModels(buildAvailableModelsResponse());

        expect(mockMessageBusBridge.sendNotification).toHaveBeenCalledWith('persistSelectedModel', {
          modelRef: 'default-model-ref',
        });
      });
    });

    describe('when a pinned model is set', () => {
      it('overrides the current selection with the pinned model', () => {
        store.selectedModelRef = 'alternate-model-ref';

        store.setChatAvailableModels(
          buildAvailableModelsResponse({
            selectableModels: [defaultModel, alternateModel, pinnedModel],
            pinnedModelOverride: pinnedModel,
          }),
        );

        expect(store.selectedModelRef).toBe('pinned-model-ref');
      });

      it('overrides a persisted selection with the pinned model', () => {
        store.selectedModelRef = 'alternate-model-ref';

        store.setChatAvailableModels(
          buildAvailableModelsResponse({
            selectableModels: [defaultModel, alternateModel, pinnedModel],
            pinnedModelOverride: pinnedModel,
          }),
        );

        expect(store.selectedModelRef).toBe('pinned-model-ref');
      });
    });

    describe('when selectableModels is empty', () => {
      it('does not crash and keeps null selection', () => {
        store.setChatAvailableModels(
          buildAvailableModelsResponse({
            selectableModels: [],
            defaultModelOverride: null,
          }),
        );

        expect(store.selectedModelRef).toBeNull();
      });
    });
  });

  describe('persistence ordering scenarios', () => {
    describe('when persisted model arrives before available models', () => {
      it('restores persisted selection and validates it against available models', () => {
        // Step 1: Persisted model arrives first
        store.setPersistedSelectedModel('alternate-model-ref');
        expect(store.selectedModelRef).toBe('alternate-model-ref');

        // Step 2: Available models arrive, persisted model is still valid
        store.setChatAvailableModels(buildAvailableModelsResponse());
        expect(store.selectedModelRef).toBe('alternate-model-ref');
      });
    });

    describe('when available models arrive before persisted model', () => {
      it('selects default model, then persisted model does not overwrite', () => {
        // Step 1: Available models arrive first, default is selected
        store.setChatAvailableModels(buildAvailableModelsResponse());
        expect(store.selectedModelRef).toBe('default-model-ref');

        // Step 2: Persisted model arrives, but selection is already set
        store.setPersistedSelectedModel('alternate-model-ref');
        expect(store.selectedModelRef).toBe('default-model-ref');
      });
    });

    describe('when persisted model is no longer available', () => {
      it('falls back to default when available models arrive', () => {
        // Step 1: Persisted model arrives
        store.setPersistedSelectedModel('removed-model-ref');
        expect(store.selectedModelRef).toBe('removed-model-ref');

        // Step 2: Available models arrive, persisted model is gone
        store.setChatAvailableModels(buildAvailableModelsResponse());
        expect(store.selectedModelRef).toBe('default-model-ref');
      });
    });
  });

  describe('chatAvailableModels getter', () => {
    beforeEach(() => {
      store.setChatAvailableModels(
        buildAvailableModelsResponse({
          selectableModels: [defaultModel, alternateModel, pinnedModel],
          pinnedModelOverride: pinnedModel,
        }),
      );
    });

    it('maps models with isDefault, isPinned, and isSelected flags', () => {
      const models = store.chatAvailableModels;

      expect(models).toEqual([
        {
          name: 'Default Model',
          ref: 'default-model-ref',
          isDefault: true,
          isPinned: false,
          isSelected: false,
        },
        {
          name: 'Alternate Model',
          ref: 'alternate-model-ref',
          isDefault: false,
          isPinned: false,
          isSelected: false,
        },
        {
          name: 'Pinned Model',
          ref: 'pinned-model-ref',
          isDefault: false,
          isPinned: true,
          isSelected: true,
        },
      ]);
    });
  });

  describe('userModelSwitchingEnabled', () => {
    describe('when instance version is 18.5.0 or later', () => {
      it('enables model switching', () => {
        store.setChatAvailableModels(buildAvailableModelsResponse({ version: '18.5.0' }));

        expect(store.userModelSwitchingEnabled).toBe(true);
      });
    });

    describe('when instance version is before 18.5.0', () => {
      it('checks feature flag', () => {
        store.setChatAvailableModels(
          buildAvailableModelsResponse({
            version: '18.4.0',
            featureFlags: [{ name: 'ai_user_model_switching', enabled: true }],
          }),
        );

        expect(store.userModelSwitchingEnabled).toBe(true);
      });

      describe('when feature flag is not enabled', () => {
        it('disables model switching', () => {
          store.setChatAvailableModels(
            buildAvailableModelsResponse({
              version: '18.4.0',
              featureFlags: [],
            }),
          );

          expect(store.userModelSwitchingEnabled).toBe(false);
        });
      });
    });
  });
});
