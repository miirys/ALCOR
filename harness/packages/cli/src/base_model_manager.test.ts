import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import type { UserPersistentStorage } from '@gitlab-org/persistent-storage';
import { SELECTED_CHAT_MODEL_STORAGE_KEY } from '@gitlab-org/persistent-storage';
import type { AvailableModelsResult, SelectedModel } from './model_manager';
import { BaseModelManager } from './base_model_manager';

const FALLBACK_MODEL: SelectedModel = { modelRef: 'fallback-ref', modelName: 'Fallback Model' };

// Minimal concrete subclass that satisfies the abstract contract
class TestModelManager extends BaseModelManager {
  getFallbackModel(): SelectedModel {
    return FALLBACK_MODEL;
  }

  getAvailableModels(): Promise<AvailableModelsResult> {
    return Promise.resolve({ models: [] });
  }
}

describe('BaseModelManager', () => {
  let mockGet: jest.MockedFunction<() => Promise<string | undefined>>;
  let mockSet: jest.MockedFunction<() => Promise<void>>;
  let mockStorage: UserPersistentStorage;
  let logger: TestLogger;

  function createManager(initialModel?: SelectedModel): TestModelManager {
    return new TestModelManager(initialModel, mockStorage, SELECTED_CHAT_MODEL_STORAGE_KEY, logger);
  }

  beforeEach(() => {
    logger = new TestLogger();
    // Use jest.fn with explicit function type so mockImplementation's parameter types are correct.
    // The UserPersistentStorage interface uses generic methods which can't be directly satisfied
    // by jest.fn, so we cast the assembled mock object through unknown.
    mockGet = jest.fn<() => Promise<string | undefined>>();
    mockGet.mockImplementation(() => Promise.resolve(undefined));
    mockSet = jest.fn<() => Promise<void>>();
    mockSet.mockImplementation(() => Promise.resolve());
    mockStorage = { get: mockGet, set: mockSet } as unknown as UserPersistentStorage;
  });

  describe('getModel()', () => {
    it('returns the initial model when provided', () => {
      const initial = { modelRef: 'initial-ref', modelName: 'Initial Model' };
      expect(createManager(initial).getModel()).toEqual(initial);
    });

    it('returns the fallback model when no initial model is set', () => {
      expect(createManager().getModel()).toEqual(FALLBACK_MODEL);
    });

    it('returns the updated model after setModel()', () => {
      const manager = createManager();
      const updated = { modelRef: 'new-ref', modelName: 'New Model' };
      manager.setModel(updated);
      expect(manager.getModel()).toEqual(updated);
    });
  });

  // setModel() and onModelChanged() are tested together because they form
  // a single listener mechanism: setModel triggers, onModelChanged subscribes.
  describe('setModel() and onModelChanged()', () => {
    it('notifies all registered listeners', () => {
      const manager = createManager();
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      manager.onModelChanged(listener1);
      manager.onModelChanged(listener2);
      const model = { modelRef: 'new-ref', modelName: 'New Model' };

      manager.setModel(model);

      expect(listener1).toHaveBeenCalledWith(model);
      expect(listener2).toHaveBeenCalledWith(model);
    });

    it('returns an unsubscribe function that stops notifications', () => {
      const manager = createManager();
      const listener = jest.fn();
      const unsubscribe = manager.onModelChanged(listener);

      unsubscribe();
      manager.setModel({ modelRef: 'ref', modelName: 'Name' });

      expect(listener).not.toHaveBeenCalled();
    });

    it('keeps notifying remaining listeners after one unsubscribes', () => {
      const manager = createManager();
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const unsubscribe1 = manager.onModelChanged(listener1);
      manager.onModelChanged(listener2);

      unsubscribe1();
      manager.setModel({ modelRef: 'ref', modelName: 'Name' });

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  describe('initialize()', () => {
    describe('when initial model is set via CLI flag', () => {
      const cliModel = { modelRef: 'cli-ref', modelName: 'CLI Model' };

      it('skips storage load', async () => {
        await createManager(cliModel).initialize();
        expect(mockStorage.get).not.toHaveBeenCalled();
      });

      it('keeps the initial model unchanged', async () => {
        const manager = createManager(cliModel);
        await manager.initialize();
        expect(manager.getModel()).toEqual(cliModel);
      });
    });

    describe('when no initial model is set', () => {
      it('reads from storage using the configured key', async () => {
        await createManager().initialize();
        expect(mockStorage.get).toHaveBeenCalledWith(SELECTED_CHAT_MODEL_STORAGE_KEY);
      });

      it('uses the fallback model when storage returns nothing', async () => {
        const manager = createManager();
        await manager.initialize();
        expect(manager.getModel()).toEqual(FALLBACK_MODEL);
      });

      describe('when storage returns a valid serialized model', () => {
        const stored = { modelRef: 'stored-ref', modelName: 'Stored Model' };

        beforeEach(() => {
          mockGet.mockImplementation(() => Promise.resolve(JSON.stringify(stored)));
        });

        it('sets the loaded model', async () => {
          const manager = createManager();
          await manager.initialize();
          expect(manager.getModel()).toEqual(stored);
        });

        it('notifies listeners with the loaded model', async () => {
          const manager = createManager();
          const listener = jest.fn();
          manager.onModelChanged(listener);

          await manager.initialize();

          expect(listener).toHaveBeenCalledWith(stored);
        });
      });

      // All three cases below share the same fallback behaviour: the raw stored
      // string is used as both modelRef and modelName.
      it.each([
        { description: 'plain string (legacy format)', stored: 'plain-model-ref' },
        { description: 'malformed JSON', stored: '{invalid-json}' },
        {
          description: 'valid JSON with wrong shape',
          stored: JSON.stringify({ unexpected: 'field' }),
        },
      ])('treats $description as a plain-string ref', async ({ stored }) => {
        mockGet.mockImplementation(() => Promise.resolve(stored));
        const manager = createManager();

        await manager.initialize();

        expect(manager.getModel()).toEqual({ modelRef: stored, modelName: stored });
      });

      describe('when storage.get throws', () => {
        beforeEach(() => {
          mockGet.mockImplementation(() => Promise.reject(new Error('Storage error')));
        });

        it('does not throw', async () => {
          await expect(createManager().initialize()).resolves.not.toThrow();
        });

        it('falls back to the fallback model', async () => {
          const manager = createManager();
          await manager.initialize();
          expect(manager.getModel()).toEqual(FALLBACK_MODEL);
        });
      });
    });
  });

  describe('saveModel()', () => {
    const model = { modelRef: 'saved-ref', modelName: 'Saved Model' };

    it('updates the in-memory model', async () => {
      const manager = createManager();
      await manager.saveModel(model);
      expect(manager.getModel()).toEqual(model);
    });

    it('notifies listeners', async () => {
      const manager = createManager();
      const listener = jest.fn();
      manager.onModelChanged(listener);

      await manager.saveModel(model);

      expect(listener).toHaveBeenCalledWith(model);
    });

    it('persists the model as JSON', async () => {
      const manager = createManager();
      await manager.saveModel(model);
      expect(mockStorage.set).toHaveBeenCalledWith(
        SELECTED_CHAT_MODEL_STORAGE_KEY,
        JSON.stringify(model),
      );
    });

    describe('when storage.set throws', () => {
      beforeEach(() => {
        mockSet.mockImplementation(() => Promise.reject(new Error('Storage write error')));
      });

      it('does not throw', async () => {
        await expect(createManager().saveModel(model)).resolves.not.toThrow();
      });

      it('still updates the in-memory model', async () => {
        const manager = createManager();
        await manager.saveModel(model);
        expect(manager.getModel()).toEqual(model);
      });
    });
  });
});
