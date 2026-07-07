import { GitLabApiService, ifVersionGte } from '@gitlab-org/core';
import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { gql } from 'graphql-request';
import { ConfigService } from '@gitlab-org/config';
import {
  DuoFeature,
  DuoFeatureAccessService,
  DuoCodeSuggestionsContext,
} from '@gitlab-org/duo-feature-access';

type AIContextSearchRequestFeatureType = 'duo_chat' | 'code_suggestions';

type EnabledDuoFeatures = Record<
  AIContextSearchRequestFeatureType,
  Set<DuoFeature | DuoCodeSuggestionsContext>
>;

type DuoConfigBeforeState = {
  isCodeCompletionEnabled: boolean | undefined;
  isDuoChatEnabled: boolean | undefined;
  isAgentPlatformEnabled: boolean | undefined;
};

@Injectable(DuoFeatureAccessService, [Logger, GitLabApiService, ConfigService])
export class DefaultDuoFeatureAccessService implements DuoFeatureAccessService {
  readonly #gitlabApiService: GitLabApiService;

  #featuresPromise: Promise<EnabledDuoFeatures> | null = null;

  #logger: Logger;

  #isApiValid = false;

  #configService: ConfigService;

  #duoConfigBeforeState: DuoConfigBeforeState = {
    isCodeCompletionEnabled: undefined,
    isDuoChatEnabled: undefined,
    isAgentPlatformEnabled: undefined,
  };

  constructor(logger: Logger, gitlabApiService: GitLabApiService, configService: ConfigService) {
    this.#gitlabApiService = gitlabApiService;
    this.#logger = withPrefix(logger, '[DuoFeatureAccessService]');
    this.#configService = configService;

    this.#gitlabApiService.onApiReconfigured((data) => {
      this.#isApiValid = data.isInValidState;
      if (data.isInValidState) {
        this.#featuresPromise = this.#fetchFeatures();
      } else {
        this.#featuresPromise = null;
      }
    });

    this.#configService.onConfigChange(() => {
      const isCodeCompletionEnabled = this.#configService.get('codeCompletion.enabled');
      const isDuoChatEnabled = this.#configService.get('duoChat.enabled');
      const isAgentPlatformEnabled = this.#configService.get('duo.agentPlatform.enabled');

      // If the config changes from disabled to enabled, or vice-versa, we need to refetch features
      if (
        this.#duoConfigBeforeState.isCodeCompletionEnabled !== isCodeCompletionEnabled ||
        this.#duoConfigBeforeState.isDuoChatEnabled !== isDuoChatEnabled ||
        this.#duoConfigBeforeState.isAgentPlatformEnabled !== isAgentPlatformEnabled
      ) {
        this.#logger.debug('Duo config changed, refetching features');
        this.#featuresPromise = this.#fetchFeatures();
      }
      this.#duoConfigBeforeState = {
        isCodeCompletionEnabled: this.#configService.get('codeCompletion.enabled'),
        isDuoChatEnabled: this.#configService.get('duoChat.enabled'),
        isAgentPlatformEnabled: this.#configService.get('duo.agentPlatform.enabled'),
      };
    });
  }

  async #fetchFeatures(): Promise<EnabledDuoFeatures> {
    // If all Duo features are disabled, return empty features without making API requests
    const isCodeCompletionEnabled = this.#configService.get('codeCompletion.enabled');
    const isDuoChatEnabled = this.#configService.get('duoChat.enabled');
    const isAgentPlatformEnabled = this.#configService.get('duo.agentPlatform.enabled');

    if (!isCodeCompletionEnabled && !isDuoChatEnabled && !isAgentPlatformEnabled) {
      this.#logger.debug(
        'All GitLab Duo features (code completion, Chat, Agent Platform) are disabled, skipping feature access check',
      );
      return {
        duo_chat: new Set<DuoFeature>(),
        code_suggestions: new Set<DuoCodeSuggestionsContext>(),
      };
    }

    if (!this.#isApiValid) {
      // Wait for API to be configured and valid
      return new Promise((resolve) => {
        const listener = this.#gitlabApiService.onApiReconfigured((data) => {
          if (data.isInValidState) {
            listener.dispose();
            resolve(this.#fetchFeatures());
          }
          // If isInValidState is false, keep waiting for the next reconfiguration
        });
      });
    }

    try {
      type GqlAvailableFeaturesResponse = {
        currentUser: {
          duoChatAvailableFeatures: DuoFeature[];
          codeSuggestionsContexts?: DuoCodeSuggestionsContext[];
        };
      };
      const query = ifVersionGte(
        this.#gitlabApiService.instanceInfo?.instanceVersion,
        '17.9.0',
        () => gql`
          query getDuoAvailableFeatures {
            currentUser {
              duoChatAvailableFeatures
              codeSuggestionsContexts
            }
          }
        `,
        () => gql`
          query getDuoChatAvailableFeatures {
            currentUser {
              duoChatAvailableFeatures
            }
          }
        `,
      );

      const response = await this.#gitlabApiService.fetchFromApi<GqlAvailableFeaturesResponse>({
        type: 'graphql',
        query,
        variables: {},
        supportedSinceInstanceVersion: {
          version: '17.6.0',
          resourceName: 'get Duo available features',
        },
      });

      const { duoChatAvailableFeatures, codeSuggestionsContexts } = response.currentUser;
      this.#logger.debug(
        `Fetched Duo available features for current user: Chat (${duoChatAvailableFeatures}), Code Suggestions (${codeSuggestionsContexts})`,
      );
      return {
        duo_chat: new Set(duoChatAvailableFeatures),
        code_suggestions: new Set(codeSuggestionsContexts),
      };
    } catch (error) {
      this.#logger.error('Error fetching Duo available features:', error);

      // Empty set means no features will be available
      return {
        duo_chat: new Set<DuoFeature>(),
        code_suggestions: new Set<DuoCodeSuggestionsContext>(),
      };
    }
  }

  async isChatFeatureEnabled(feature: DuoFeature): Promise<boolean> {
    if (!this.#featuresPromise) {
      this.#featuresPromise = this.#fetchFeatures();
    }
    const features = await this.#featuresPromise;
    return features.duo_chat.has(feature);
  }

  async isSuggestionsFeatureEnabled(feature: DuoCodeSuggestionsContext): Promise<boolean> {
    if (!this.#featuresPromise) {
      this.#featuresPromise = this.#fetchFeatures();
    }
    const features = await this.#featuresPromise;
    return features.code_suggestions.has(feature);
  }
}
