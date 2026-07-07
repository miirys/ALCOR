import { z } from 'zod';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { type ClientSettings, UserPersistentStorage } from '@gitlab-org/persistent-storage';
import { AvailableModelsResult, ModelManager, SelectedModel } from './model_manager';

const selectedModelSchema = z.object({
  modelRef: z.string(),
  modelName: z.string(),
});

/**
 * Keys from ClientSettings whose value type is a plain string.
 * Used to constrain the storageKey parameter so TypeScript can infer
 * get/set value types without unsafe casts.
 */
type StringClientSettingsKey = {
  [K in keyof ClientSettings]: ClientSettings[K] extends string ? K : never;
}[keyof ClientSettings];

/**
 * Abstract base class that encapsulates the shared ModelManager logic:
 * listeners, storage-backed initialization, and model persistence.
 * Subclasses provide their own initial model value and storage key.
 */
export abstract class BaseModelManager implements ModelManager {
  #model: SelectedModel | undefined;

  #listeners = new Set<(model: SelectedModel) => void>();

  #userPersistentStorage: UserPersistentStorage;

  #storageKey: StringClientSettingsKey;

  #logger: Logger;

  constructor(
    initialModel: SelectedModel | undefined,
    userPersistentStorage: UserPersistentStorage,
    storageKey: StringClientSettingsKey,
    logger: Logger,
  ) {
    this.#model = initialModel;
    this.#userPersistentStorage = userPersistentStorage;
    this.#storageKey = storageKey;
    this.#logger = withPrefix(logger, '[ModelManager]');
  }

  protected abstract getFallbackModel(): SelectedModel;

  abstract getAvailableModels(): Promise<AvailableModelsResult>;

  getModel(): SelectedModel {
    return this.#model ?? this.getFallbackModel();
  }

  setModel(model: SelectedModel): void {
    this.#model = model;
    this.#listeners.forEach((cb) => cb(model));
  }

  onModelChanged(callback: (model: SelectedModel) => void): () => void {
    this.#listeners.add(callback);
    return () => this.#listeners.delete(callback);
  }

  /**
   * Loads the persisted model from storage on startup.
   * Skipped if a model was already set via CLI flag.
   */
  async initialize(): Promise<void> {
    if (this.#model) {
      this.#logger.info(
        `Model already set via CLI flag: "${this.#model.modelRef}", skipping storage load`,
      );
      return;
    }

    try {
      const stored = await this.#userPersistentStorage.get(this.#storageKey);
      if (stored) {
        const model = this.#deserialize(stored);
        this.#logger.info(`Loaded persisted model from storage: "${model.modelRef}"`);
        this.setModel(model);
      }
    } catch (error) {
      this.#logger.warn('Failed to load persisted model from storage', error);
    }
  }

  /**
   * Sets the model and persists it to storage.
   * Fires onModelChanged listeners via setModel().
   */
  async saveModel(model: SelectedModel): Promise<void> {
    this.setModel(model);

    try {
      await this.#userPersistentStorage.set(this.#storageKey, JSON.stringify(model));
      this.#logger.info(`Persisted selected model: "${model.modelRef}"`);
    } catch (error) {
      this.#logger.warn('Failed to persist selected model', error);
    }
  }

  #deserialize(stored: string): SelectedModel {
    try {
      const result = selectedModelSchema.safeParse(JSON.parse(stored));
      if (result.success) {
        return result.data;
      }
    } catch {
      // fall through to legacy handling
    }
    // Legacy format: plain ref string stored before this change
    return { modelRef: stored, modelName: stored };
  }
}
