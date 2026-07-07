import { gql } from 'graphql-request';
import { Disposable } from '@gitlab-org/disposable';
import { AbortError, isNotAbort, retry } from '@gitlab-org/resiliency';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import {
  ApiRequest,
  AGENTIC_CHAT_NO_SUPPORT,
  isNot4xxFailure,
  doNotAwait,
  GitLabApiService,
  EventEmitterImpl,
  diffEmitter,
  UserService,
} from '@gitlab-org/core';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import { InvalidInstanceVersionError } from '@gitlab-org/fetch';
import { StateCheck, StateCheckChangedEventData } from '@gitlab-org/feature-state';
import { DuoWorkspaceProjectAccessCache } from '../../services/duo_access';
import { waitMs } from '../../utils/wait_ms';

export type AgenticChatSupportCheck = StateCheck<typeof AGENTIC_CHAT_NO_SUPPORT>;

export const AgenticChatSupportCheck =
  createInterfaceId<AgenticChatSupportCheck>('AgenticChatSupportCheck');

export interface GqlAgenticChatAvailable {
  project: {
    duoAgenticChatAvailable: boolean;
  };
}

const DEBOUNCE_DELAY_MS = 500;

@Injectable(AgenticChatSupportCheck, [
  GitLabApiService,
  ConfigService,
  DuoWorkspaceProjectAccessCache,
  Logger,
  UserService,
])
export class DefaultAgenticChatSupportCheck implements AgenticChatSupportCheck {
  #api: GitLabApiService;

  #configService: ConfigService;

  #projectAccessCache: DuoWorkspaceProjectAccessCache;

  #logger: Logger;

  #userService: UserService;

  #subscriptions: Disposable[] = [];

  #stateEmitter = diffEmitter(new EventEmitterImpl<StateCheckChangedEventData>());

  #chatAvailable = true;

  #isAgentPlatformEnabledBeforeState: boolean | undefined;

  #initialRequestAbortController = new AbortController();

  constructor(
    api: GitLabApiService,
    configService: ConfigService,
    projectAccessCache: DuoWorkspaceProjectAccessCache,
    logger: Logger,
    userService: UserService,
  ) {
    this.#api = api;
    this.#configService = configService;
    this.#logger = withPrefix(logger, '[AgenticChatSupportCheck]');
    this.#projectAccessCache = projectAccessCache;
    this.#userService = userService;

    this.#isAgentPlatformEnabledBeforeState =
      this.#configService.get('duo.agentPlatform.enabled') ?? false;

    this.#subscriptions.push(
      this.#projectAccessCache.onDuoProjectCacheUpdate(async (_, signal) => {
        this.#initialRequestAbortController.abort();
        await this.#update(signal);
      }),
    );

    this.#subscriptions.push(
      this.#configService.onConfigChange(() => {
        const isAgentPlatformEnabled = this.#configService.get('duo.agentPlatform.enabled');
        if (this.#isAgentPlatformEnabledBeforeState !== isAgentPlatformEnabled) {
          this.#isAgentPlatformEnabledBeforeState = isAgentPlatformEnabled;
          this.#logger.debug('Agent platform config changed, recalculating availability');

          this.#initialRequestAbortController.abort();
          this.#initialRequestAbortController = new AbortController();
          doNotAwait(this.#update(this.#initialRequestAbortController.signal));
        }
      }),
    );

    doNotAwait(this.#update(this.#initialRequestAbortController.signal));
  }

  #createQuery(projectPath: string): ApiRequest<GqlAgenticChatAvailable> {
    return {
      type: 'graphql',
      query: gql`
        query agenticChatAvailable($projectPath: ID!) {
          project(fullPath: $projectPath) {
            duoAgenticChatAvailable
          }
        }
      `,
      variables: { projectPath },
      supportedSinceInstanceVersion: {
        version: '18.1.0',
        resourceName: 'get project Duo Agentic Chat support',
      },
    };
  }

  async #checkChatSupport(projectPath: string, signal: AbortSignal): Promise<boolean> {
    const query = this.#createQuery(projectPath);
    try {
      const response = await retry(this.#api.fetchOperation(query), {
        signal,
        shouldRetry: [isNotAbort, isNot4xxFailure],
        onRetry: (count, error) => {
          this.#logger.warn(
            `Failed to fetch api status information for ${this.id}. Retrying (attempt number ${count})`,
            error,
          );
        },
      });

      return response.project?.duoAgenticChatAvailable ?? false;
    } catch (error) {
      if (error instanceof AbortError) {
        this.#logger.debug(`Request aborted for project ${projectPath}`);
        return false;
      }

      this.#logger.error(
        `Failed to request Agentic Chat availability for project path ${projectPath}.`,
        error,
      );

      if (error instanceof InvalidInstanceVersionError) {
        return false;
      }

      return false;
    }
  }

  onChanged = this.#stateEmitter.event;

  get engaged() {
    return !this.#chatAvailable;
  }

  get details() {
    return this.engaged
      ? 'Agentic Chat is not supported. Ensure at least one of your projects has access or configure a default namespace in user settings.'
      : 'Agentic Chat is supported. One of your projects has access or a default namespace is configured in user settings.';
  }

  id = AGENTIC_CHAT_NO_SUPPORT;

  dispose() {
    this.#initialRequestAbortController?.abort();
    this.#subscriptions.forEach((subscription) => subscription.dispose());
    this.#subscriptions = [];
  }

  async #update(signal: AbortSignal): Promise<void> {
    await waitMs(DEBOUNCE_DELAY_MS);
    if (signal.aborted) return;

    try {
      const isAgentPlatformEnabled = this.#configService.get('duo.agentPlatform.enabled');
      if (!isAgentPlatformEnabled) {
        this.#logger.debug('Agent platform is disabled, skipping Agentic Chat availability check');
        this.#setChatAvailable(false);
        return;
      }

      this.#logger.debug('Recalculating Agentic Chat availability...');

      const workspaceFolders = this.#configService.get('workspaceFolders');
      if (!workspaceFolders?.length) {
        this.#logger.debug('No workspace folders found.');
        this.#setChatAvailable(false);
        return;
      }

      this.#logger.debug(`Detected ${workspaceFolders.length} workspace folder(s)`);

      const duoProjects = workspaceFolders.flatMap((wf) =>
        this.#projectAccessCache.getProjectsForWorkspaceFolder(wf),
      );

      if (!duoProjects.length) {
        if (signal.aborted) return;

        const configDefaultNamespace =
          this.#configService.get('duo')?.agentPlatform?.defaultNamespace;
        const effectiveDefaultNamespace =
          (await this.#getUserDefaultNamespace()) || configDefaultNamespace;

        if (effectiveDefaultNamespace) {
          this.#logger.debug(
            `No Duo projects found in workspace folders. Falling back to the default namespace. ${effectiveDefaultNamespace}`,
          );
          // TODO: Introduce a GraphQL API to check the chat support on the namespace.
          // https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/1315
          this.#setChatAvailable(true);
          return;
        }

        this.#logger.debug('No Duo projects found in workspace folders.');
        this.#setChatAvailable(false);
        return;
      }

      this.#logger.debug(`Checking ${duoProjects.length} project(s) for Agentic Chat support`);

      const checks = await Promise.allSettled(
        duoProjects.map(async (project) => {
          const supported = await this.#checkChatSupport(project.namespaceWithPath, signal);
          this.#logger.debug(
            `Agentic Chat is ${supported ? '' : 'NOT '}supported for project ${project.namespaceWithPath}`,
          );
          return supported;
        }),
      );

      const chatAvailable = checks.some(
        (result) => result.status === 'fulfilled' && result.value === true,
      );

      if (signal.aborted) return;

      this.#setChatAvailable(chatAvailable);
    } catch (e) {
      if (signal.aborted) return;

      this.#logger.error(
        'Failed to calculate Agentic Chat availability. Chat will be unavailable.',
        e,
      );
      this.#setChatAvailable(false);
    }
  }

  #setChatAvailable(available: boolean): void {
    this.#chatAvailable = available;
    this.#stateEmitter.fire({ checkId: this.id, engaged: this.engaged, details: this.details });
  }

  async #getUserDefaultNamespace(): Promise<string | undefined> {
    try {
      const user = await this.#userService.getUser();
      return user.duoDefaultNamespacePath;
    } catch (error) {
      this.#logger.debug('Failed to get user default namespace', error);
      return undefined;
    }
  }
}
