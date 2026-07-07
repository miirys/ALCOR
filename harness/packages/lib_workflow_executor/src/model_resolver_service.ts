import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { FeatureFlagService, InstanceFeatureFlags } from '@gitlab-org/core';
import { WorkflowRailsService } from './api/workflow_rails_service';

export interface ModelResolverService {
  resolveModel(
    requestedModel: string | undefined,
    rootNamespaceId?: string,
  ): Promise<string | undefined>;
}

export const ModelResolverService = createInterfaceId<ModelResolverService>('ModelResolverService');

@Injectable(ModelResolverService, [WorkflowRailsService, FeatureFlagService, Logger])
export class DefaultModelResolverService implements ModelResolverService {
  #workflowRailsService: WorkflowRailsService;

  #featureFlagService: FeatureFlagService;

  #logger: Logger;

  constructor(
    workflowRailsService: WorkflowRailsService,
    featureFlagService: FeatureFlagService,
    logger: Logger,
  ) {
    this.#workflowRailsService = workflowRailsService;
    this.#featureFlagService = featureFlagService;
    this.#logger = withPrefix(logger, '[ModelResolverService]');
  }

  async resolveModel(
    requestedModel: string | undefined,
    rootNamespaceId?: string,
  ): Promise<string | undefined> {
    const response = await this.#workflowRailsService.getAiChatAvailableModels({
      rootNamespaceId,
    });
    const available = response?.aiChatAvailableModels;

    const pinned = available?.pinnedModel?.ref;
    if (pinned) {
      if (requestedModel && requestedModel !== pinned) {
        this.#logger.info(
          `Model selection overridden by pinned model: requested="${requestedModel}", using="${pinned}"`,
        );
      } else {
        this.#logger.info(`Using pinned model: "${pinned}"`);
      }
      return pinned;
    }

    if (!this.#featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.UserModelSwitching)) {
      if (requestedModel) {
        this.#logger.warn(
          `Model selection ignored: user model switching is disabled on this instance (requested="${requestedModel}")`,
        );
      }
      return undefined;
    }

    const userSelected = available?.selectableModels.find((m) => m.ref === requestedModel)?.ref;
    if (userSelected) {
      this.#logger.info(`Using user-selected model: "${userSelected}"`);
      return userSelected;
    }

    if (requestedModel) {
      const selectableRefs = available?.selectableModels.map((m) => m.ref).join(', ');
      // The requested model isn't in the client's chat model-switching list. For flows
      // that don't use client-side model switching (e.g. code review) this list is empty
      // and the model is chosen server-side from the feature setting — so there's nothing
      // actionable to log. Only log when models WERE available to switch between (a real
      // chat flow); otherwise it's pure noise (runners log at debug, so even debug shows).
      if (selectableRefs) {
        this.#logger.debug(
          `Requested chat model "${requestedModel}" is not in the selectable set [${selectableRefs}]; the server will select the model for the active feature.`,
        );
      }
    }

    const defaultModel = available?.defaultModel?.ref;
    if (defaultModel) {
      this.#logger.info(`Using default model: "${defaultModel}"`);
      return defaultModel;
    }

    this.#logger.debug(
      'No model selected on the client; the server will apply the default model configured for the active feature (expected for non-chat flows such as code review).',
    );
    return undefined;
  }
}
