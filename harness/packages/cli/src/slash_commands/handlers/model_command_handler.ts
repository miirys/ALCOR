import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { doNotAwait } from '@gitlab-org/core';
import {
  CLI_INPUT_TYPES,
  defaultInputState,
  ModelSelectionInput,
  modelSelectionFooterHint,
  type ModelSelectionCallbacks,
} from '@gitlab-org/tui';
import type { ControllerApi } from '../../commands/tui/controller_api';
import { ModelManager, SelectedModel } from '../../model_manager';
import { SlashCommandHandler, type CommandComponentEntry } from '../slash_command_handler';

@Injectable(SlashCommandHandler, [ModelManager, Logger])
export class DefaultModelCommandHandler implements SlashCommandHandler<ModelSelectionCallbacks> {
  #modelManager: ModelManager;

  #logger: Logger;

  command = {
    name: '/model',
    description: 'Select the AI model to use for this session',
    action: 'model',
  } as const;

  constructor(modelManager: ModelManager, logger: Logger) {
    this.#modelManager = modelManager;
    this.#logger = withPrefix(logger, '[ModelCommandHandler]');
  }

  async execute(api: ControllerApi): Promise<void> {
    await this.#openModelSelection(api);
  }

  getComponent(api: ControllerApi): CommandComponentEntry<ModelSelectionCallbacks> {
    return {
      inputType: CLI_INPUT_TYPES.MODEL_SELECTION,
      component: ModelSelectionInput,
      footerHint: modelSelectionFooterHint,
      callbacks: {
        onCancelModelSelection: () => this.#cancelModelSelection(api),
        onSelectModel: (ref: string, name: string) => {
          doNotAwait(this.#selectModel(api, { modelRef: ref, modelName: name }));
        },
      },
    };
  }

  async #openModelSelection(api: ControllerApi): Promise<void> {
    this.#logger.info('Opening model selection');

    // Show loading state immediately
    api.mutateState((state) => ({
      ...state,
      input: {
        inputType: CLI_INPUT_TYPES.MODEL_SELECTION,
        models: [],
        selectedIndex: 0,
        isLoading: true,
        currentModel: this.#modelManager.getModel().modelRef,
      },
    }));

    try {
      const { models } = await this.#modelManager.getAvailableModels();

      api.mutateState((state) => {
        if (state.input.inputType !== CLI_INPUT_TYPES.MODEL_SELECTION) return state;
        return {
          ...state,
          input: {
            ...state.input,
            models,
            isLoading: false,
          },
        };
      });
    } catch (error) {
      this.#logger.error('Failed to fetch available models', error);
      api.mutateState((state) => {
        if (state.input.inputType !== CLI_INPUT_TYPES.MODEL_SELECTION) return state;
        return { ...state, input: defaultInputState };
      });
      api.showError('Failed to load available models. Please try again.');
    }
  }

  #cancelModelSelection(api: ControllerApi): void {
    this.#logger.info('Cancelling model selection');
    api.mutateState((state) => ({ ...state, input: defaultInputState }));
  }

  async #selectModel(api: ControllerApi, model: SelectedModel): Promise<void> {
    this.#logger.info(`Selecting model: "${model.modelRef}"`);

    await this.#modelManager.saveModel(model);

    api.mutateState((state) => ({ ...state, input: defaultInputState }));
  }
}
