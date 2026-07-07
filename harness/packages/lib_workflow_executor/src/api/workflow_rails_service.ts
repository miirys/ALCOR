import {
  GID_NAMESPACE_GROUP,
  GitLabApiService,
  ifVersionGte,
  isFetchError,
  toGitLabGid,
} from '@gitlab-org/core';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import type {
  DuoWorkflowMessage,
  DuoWorkflowStatusUpdate,
  DuoWorkflowStatusUpdateResponse,
  WorkflowEvent,
  ContainerParams,
} from '@gitlab-lsp/workflow-api';
import {
  defaultAgentPrivileges,
  WorkflowType,
  WorkflowGraphqlPayload,
} from '@gitlab-lsp/workflow-api';
import {
  GraphQLOperation,
  GraphQLService,
  KnownGraphQLOperations,
  AiChatAvailableModelsData,
  AiChatAvailableModelsVariables,
} from '@gitlab-org/graphql';
import type { WorkflowId } from '..';
import {
  CreateWorkflowEventResponse,
  CreateWorkflowOptions,
  CreateWorkflowResponse,
  GenerateTokenResponse,
} from './types';
import { WorkflowGraphqlOperations } from './workflow_graphql_operations';
import { DuoCliDisabledError, throwIfDuoAccessError } from './errors';

export interface WorkflowRailsService {
  updateStatus(statusUpdate: DuoWorkflowStatusUpdate): Promise<DuoWorkflowStatusUpdateResponse>;
  sendEvent(
    workflowID: WorkflowId,
    eventType: WorkflowEvent,
    message?: DuoWorkflowMessage,
  ): Promise<void>;
  createWorkflow(
    goal: string,
    containerParams: ContainerParams,
    type?: WorkflowType,
    workflowDefinition?: string,
    aiCatalogItemVersionId?: number,
    additionalOptions?: CreateWorkflowOptions,
  ): Promise<WorkflowId>;
  getWorkflowToken(
    type?: WorkflowType,
    rootNamespaceId?: string,
    projectPath?: string,
  ): Promise<GenerateTokenResponse>;
  revokeWorkflowToken(workflowToken: GenerateTokenResponse): Promise<void>;
  getGraphqlData<T>(payload: WorkflowGraphqlPayload): Promise<T>;
  setAgentPrivileges(agentPrivilges: number[]): void;
  getEnabledWorkflowFeatureFlags(anyWorkflowId: WorkflowId): Promise<string[]>;
  getAiChatAvailableModels({
    rootNamespaceId,
  }: AiChatAvailableModelsVariables): Promise<AiChatAvailableModelsData | null>;
}

export const WorkflowRailsService = createInterfaceId<WorkflowRailsService>('WorkflowRailsService');
const AGENT_IDE_ENVIRONMENT = 'ide' as const;

@Injectable(WorkflowRailsService, [
  Logger,
  GitLabApiService,
  WorkflowGraphqlOperations,
  GraphQLService,
])
export class DefaultWorkflowRailsService implements WorkflowRailsService {
  #logger: Logger;

  #api: GitLabApiService;

  #agentPrivileges: number[];

  #graphqlOperations: WorkflowGraphqlOperations;

  #graphqlService: GraphQLService;

  #aiChatAvailableModelsResponse: AiChatAvailableModelsData | null = null;

  #enabledFeatureFlags: string[] | null = null;

  #lastServerCapabilities: string[] | null = null;

  constructor(
    logger: Logger,
    gitlabApiService: GitLabApiService,
    graphqlOperations: WorkflowGraphqlOperations,
    graphqlService: GraphQLService,
  ) {
    this.#logger = withPrefix(logger, '[WorkflowRailsService]');
    this.#api = gitlabApiService;
    this.#agentPrivileges = defaultAgentPrivileges;
    this.#graphqlOperations = graphqlOperations;
    this.#graphqlService = graphqlService;

    this.#api.onApiReconfigured(() => {
      this.#aiChatAvailableModelsResponse = null;
      this.#enabledFeatureFlags = null;
      this.#lastServerCapabilities = null;
    });
  }

  async updateStatus({ workflowId, statusEvent }: DuoWorkflowStatusUpdate) {
    return this.#api?.fetchFromApi<DuoWorkflowStatusUpdateResponse>({
      type: 'rest',
      path: `/api/v4/ai/duo_workflows/workflows/${workflowId}`,
      method: 'PATCH',
      body: {
        status_event: statusEvent,
      },
    });
  }

  async sendEvent(
    workflowID: WorkflowId,
    eventType: WorkflowEvent,
    message?: DuoWorkflowMessage,
  ): Promise<void> {
    const response = await this.#api?.fetchFromApi<CreateWorkflowEventResponse>({
      type: 'rest',
      method: 'POST',
      path: `/api/v4/ai/duo_workflows/workflows/${workflowID}/events`,
      body: {
        event_type: eventType,
        ...(message || { message: '' }),
      },
      supportedSinceInstanceVersion: {
        resourceName: 'create a workflow event',
        version: '17.5.0',
      },
    });

    if (!response) {
      throw new Error('Failed to create event');
    }
  }

  setAgentPrivileges(agentPrivileges: number[]) {
    this.#agentPrivileges = agentPrivileges;
    this.#logger.info(`Updated agent privileges: ${agentPrivileges}`);
  }

  async createWorkflow(
    goal: string,
    containerParams: ContainerParams,
    type?: WorkflowType,
    workflowDefinition?: string,
    aiCatalogItemVersionId?: number,
    additionalOptions: CreateWorkflowOptions = {},
  ): Promise<WorkflowId> {
    const allowAgentToRequestUser = additionalOptions?.allowAgentToRequestUser ?? true;
    const agentPrivileges = additionalOptions?.agentPrivileges ?? this.#agentPrivileges;
    const preApprovedAgentPrivileges = additionalOptions?.preApprovedAgentPrivileges ?? undefined;
    const requiresDuoCliEnabled = additionalOptions?.requiresDuoCliEnabled;

    try {
      const basePayload = {
        ...containerParams,
        goal,
        workflow_definition: workflowDefinition || type || WorkflowType.SOFTWARE_DEVELOPMENT,
        environment: AGENT_IDE_ENVIRONMENT,
        allow_agent_to_request_user: allowAgentToRequestUser,
      };

      const v176Additions = {
        agent_privileges: agentPrivileges,
      };

      const v180Additions = {
        ...v176Additions,
        pre_approved_agent_privileges: preApprovedAgentPrivileges,
      };

      const v184Additions = {
        ...v180Additions,
        ai_catalog_item_version_id: aiCatalogItemVersionId,
      };

      const v191Additions = {
        ...v184Additions,
        ...(requiresDuoCliEnabled !== undefined && {
          requires_duo_cli_enabled: requiresDuoCliEnabled,
        }),
      };

      const body = ifVersionGte(
        this.#api?.instanceInfo?.instanceVersion,
        '19.1.0',
        () => ({ ...basePayload, ...v191Additions }),
        () =>
          ifVersionGte(
            this.#api?.instanceInfo?.instanceVersion,
            '18.4.0',
            () => ({ ...basePayload, ...v184Additions }),
            () =>
              ifVersionGte(
                this.#api?.instanceInfo?.instanceVersion,
                '18.0.0',
                () => ({ ...basePayload, ...v180Additions }),
                () =>
                  ifVersionGte(
                    this.#api?.instanceInfo?.instanceVersion,
                    '17.6.0',
                    () => ({ ...basePayload, ...v176Additions }),
                    () => basePayload,
                  ),
              ),
          ),
      );
      const response = await this.#api?.fetchFromApiRaw({
        type: 'rest',
        method: 'POST',
        path: '/api/v4/ai/duo_workflows/workflows',
        body,
        supportedSinceInstanceVersion: {
          resourceName: 'create a workflow',
          version: '17.3.0',
        },
      });

      let responseData: CreateWorkflowResponse;
      try {
        responseData = (await response.json()) as CreateWorkflowResponse;
      } catch {
        responseData = {} as CreateWorkflowResponse;
      }

      if (!response.ok) {
        this.#handleCreateWorkflowError(response, responseData);
      }

      this.#parseFeatureFlags(response);

      if (responseData.id === null || responseData.id === undefined) {
        const apiErrorMessage = responseData.message || responseData.error || '';
        const errMessage = `An error occurred while creating the workflow. No workflow ID was returned from the API: ${apiErrorMessage}`;
        this.#logger.error(`${errMessage}. Response was: ${JSON.stringify(responseData)}`);
        throw new Error(errMessage);
      }

      return responseData.id.toString();
    } catch (e) {
      const error = e as Error;
      this.#logger.error('Failed to create the workflow', error);
      throw e;
    }
  }

  async getWorkflowToken(
    type?: WorkflowType,
    rootNamespaceId?: string,
    projectPath?: string,
  ): Promise<GenerateTokenResponse> {
    try {
      const body: {
        workflow_definition: WorkflowType;
        root_namespace_id?: string;
        project_id?: string;
      } = {
        workflow_definition: type || WorkflowType.SOFTWARE_DEVELOPMENT,
      };

      if (rootNamespaceId) {
        body.root_namespace_id = rootNamespaceId;
      }

      if (projectPath) {
        // The backend API field is named `project_id` but accepts a project path value
        body.project_id = projectPath;
      }

      this.#logger.debug(
        `Requesting token with rootNamespaceId: ${rootNamespaceId ?? 'undefined'}, projectPath: ${projectPath ?? 'undefined'}`,
      );

      const token = await this.#api?.fetchFromApi<GenerateTokenResponse>({
        type: 'rest',
        method: 'POST',
        path: '/api/v4/ai/duo_workflows/direct_access',
        body,
        supportedSinceInstanceVersion: {
          resourceName: 'get workflow direct access',
          version: '18.1.0',
        },
      });

      this.#logServerCapabilitiesIfChanged(token.server_capabilities);

      return token;
    } catch (e) {
      const error = e as Error;
      this.#logger.error('Failed to fetch the workflow token', error);
      if (isFetchError(e) && e.status === 403) {
        throwIfDuoAccessError(e.status, e.body);
      }
      throw e;
    }
  }

  async revokeWorkflowToken(workflowToken: GenerateTokenResponse): Promise<void> {
    try {
      const instanceVersion = this.#api?.instanceInfo?.instanceVersion;

      // Use the new endpoint for GitLab 18.4+ and the old endpoint for 18.3 and earlier
      const shouldUseNewEndpoint = instanceVersion && this.#isVersionGte(instanceVersion, '18.4.0');

      await this.#api?.fetchFromApi({
        type: 'rest',
        method: 'POST',
        path: shouldUseNewEndpoint ? '/api/v4/ai/duo_workflows/revoke_token' : '/oauth/revoke',
        body: {
          token: workflowToken.gitlab_rails.token,
        },
        supportedSinceInstanceVersion: {
          resourceName: 'revoke workflow token',
          version: shouldUseNewEndpoint ? '18.4.0' : '15.1.0',
        },
      });

      this.#logger.info('Successfully revoked workflow token');
    } catch (e) {
      const error = e as Error;

      const wrappedError = new Error('Could not revoke workflow token');

      // For some reason TypeScript is not allowing ES2022 feature usage (like Error.cause)
      // https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/1035
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrappedError as any).cause = error;

      throw wrappedError;
    }
  }

  async getGraphqlData<T>({
    operationName,
    query,
    variables,
    supportedSinceInstanceVersion,
    fragment,
    signal,
  }: WorkflowGraphqlPayload): Promise<T> {
    if (operationName) {
      const op = KnownGraphQLOperations[operationName] as GraphQLOperation<T>;
      if (!op) {
        throw new Error(`Unknown GraphQL operation: ${operationName}`);
      }
      return this.#graphqlService.execute(op, variables, signal);
    }

    if (query) {
      return this.#getGenericGraphqlData({
        query,
        variables,
        supportedSinceInstanceVersion,
        fragment,
        signal,
      });
    }

    throw new Error(
      'Missing required argument either "operationName" or "query" must be provided.',
    );
  }

  /**
   * @deprecated Declare an operation in the `lib_graphql` package instead.
   */
  async #getGenericGraphqlData<T>({
    query,
    variables,
    supportedSinceInstanceVersion,
    fragment,
    signal,
  }: WorkflowGraphqlPayload): Promise<T> {
    if (!this.#graphqlOperations.containsQuery(query)) {
      this.#logger.error(`: ${JSON.stringify({ query })}`);
      throw new Error('Provided Graphql query is not meeting performance standards.');
    }

    try {
      let addedFragment = '';

      if (fragment) {
        const { lt, gte, version } = fragment;

        addedFragment = ifVersionGte(
          this.#api?.instanceInfo?.instanceVersion,
          version,
          () => gte,
          () => lt,
        );
      }

      return await this.#api?.fetchFromApi<T>({
        type: 'graphql',
        query: `${query}\n${addedFragment}`,
        variables: variables || {},
        supportedSinceInstanceVersion,
        signal,
      });
    } catch (e) {
      this.#logger.info(`Graphql fetch failed:`, e);

      const error = e as Error;

      this.#logger.error(error);

      throw new Error(error.message);
    }
  }

  async getAiChatAvailableModels({
    rootNamespaceId,
  }: AiChatAvailableModelsVariables): Promise<AiChatAvailableModelsData | null> {
    if (!rootNamespaceId) {
      this.#logger.debug('Skipping available model lookup: no namespace available.');
      return null;
    }

    // TODO: Cache this response instead of requiring a refresh.
    // https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/1558
    if (!this.#aiChatAvailableModelsResponse) {
      try {
        const variables = {
          rootNamespaceId: toGitLabGid(GID_NAMESPACE_GROUP, rootNamespaceId),
        };
        this.#aiChatAvailableModelsResponse = await this.getGraphqlData<AiChatAvailableModelsData>({
          query: null,
          operationName: 'aiChatAvailableModels',
          variables,
        });
      } catch (err) {
        this.#logger.warn('Unexpected exception fetching aiChatAvailableModels', err);
        this.#aiChatAvailableModelsResponse = null;
      }
    }

    return this.#aiChatAvailableModelsResponse;
  }

  /**
   * Get the enabled feature flags.
   * Requires a workflowId to look up, but the feature flags are not workflow specific so we can cache the response
   */
  async getEnabledWorkflowFeatureFlags(anyWorkflowId: WorkflowId): Promise<string[]> {
    if (this.#enabledFeatureFlags) {
      return this.#enabledFeatureFlags;
    }

    try {
      const response = await this.#api?.fetchFromApiRaw({
        type: 'rest',
        method: 'HEAD',
        path: `/api/v4/ai/duo_workflows/workflows/${anyWorkflowId}`,
        supportedSinceInstanceVersion: {
          resourceName: 'get workflow',
          version: '17.3.0',
        },
      });

      return this.#parseFeatureFlags(response);
    } catch (e) {
      const error = e as Error;
      this.#logger.error('Failed to get enabled feature flags header', error);
      throw e;
    }
  }

  #parseFeatureFlags(response: Response): string[] {
    const headerValue = response.headers.get('x-gitlab-enabled-feature-flags');
    this.#enabledFeatureFlags = headerValue ? headerValue.split(',').filter(Boolean) : [];
    return this.#enabledFeatureFlags;
  }

  #logServerCapabilitiesIfChanged(capabilities: string[] | undefined): void {
    const current = capabilities ? [...capabilities].sort() : [];
    const previous = this.#lastServerCapabilities;

    if (previous === null) {
      // First time — always log (warn if missing, info if present)
      if (!capabilities) {
        this.#logger.warn('[Direct Access] No server_capabilities in response');
      } else {
        this.#logger.info(`[Direct Access] Server capabilities: [${current.join(', ')}]`);
      }
    } else {
      const changed =
        current.length !== previous.length || current.some((cap, i) => cap !== previous[i]);

      if (changed) {
        this.#logger.info(
          `[Direct Access] Server capabilities changed: [${previous.join(', ')}] -> [${current.join(', ')}]`,
        );
      }
    }

    this.#lastServerCapabilities = current;
  }

  #isVersionGte(current: string, minimumRequired: string): boolean {
    return ifVersionGte(
      current,
      minimumRequired,
      () => true,
      () => false,
    );
  }

  #handleCreateWorkflowError(response: Response, responseData: CreateWorkflowResponse): never {
    const responseMessage =
      typeof responseData === 'object' && responseData !== null && 'message' in responseData
        ? String((responseData as { message?: unknown }).message)
        : '';

    if (
      response.status === 403 &&
      responseMessage.toLowerCase().includes('duo cli has been disabled')
    ) {
      this.#logger.error('Duo CLI is disabled by administrator');
      throw new DuoCliDisabledError(responseMessage);
    }

    if (response.status === 403) {
      throwIfDuoAccessError(response.status, JSON.stringify(responseData));
    }

    const errMessage = `Failed to create workflow: HTTP ${response.status}. ${responseMessage}`;
    this.#logger.error(`${errMessage}. Response was: ${JSON.stringify(responseData)}`);
    throw new Error(errMessage);
  }
}
