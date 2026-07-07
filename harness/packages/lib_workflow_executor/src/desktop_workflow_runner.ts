import { InvalidInstanceVersionError } from '@gitlab-org/fetch';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { isFileSchemeUri, workspaceFolderPathFromUri } from '@gitlab-org/fs';
import {
  DuoWorkflowStatusUpdate,
  DuoWorkflowMessage,
  RunWorkflowPayload,
  WorkflowEvent,
  WorkflowType,
  WorkflowRunner,
  WorkflowGraphqlPayload,
  WorkflowMetadata,
  WorkflowStreamEvent,
  generateGraphqlWorkflowId,
} from '@gitlab-lsp/workflow-api';
import type { UpdateAgentPrivilegesData } from '@gitlab-org/graphql';
import { withPrefix, Logger } from '@gitlab-org/logging';
import { Injectable } from '@gitlab/needle';
import { ConfigService, ClientConfig } from '@gitlab-org/config';
import { doNotAwait, tryParseGitLabGid, UserService } from '@gitlab-org/core';
import { ExecutorManager } from './executors/executor_manager';
import { CreateWorkflowOptions } from './api/types';
import { WorkflowRailsService } from './api/workflow_rails_service';
import { WorkflowTokenService } from './api/workflow_token_service';
import { ModelResolverService } from './model_resolver_service';

@Injectable(WorkflowRunner, [
  ConfigService,
  Logger,
  WorkflowRailsService,
  WorkflowTokenService,
  ExecutorManager,
  ModelResolverService,
  UserService,
])
export class DesktopWorkflowRunner implements WorkflowRunner {
  #workspaceFolders?: WorkspaceFolder[];

  #projectPath: string | undefined;

  #defaultNamespacePath: string | undefined;

  #executorManager: ExecutorManager;

  #prefixedLogger: Logger;

  #logger: Logger;

  #workflowRailsService: WorkflowRailsService;

  #workflowTokenService: WorkflowTokenService;

  #modelResolverService: ModelResolverService;

  #userService: UserService;

  #userPreferencesDefaultNamespacePath: string | undefined;

  constructor(
    configService: ConfigService,
    logger: Logger,
    workflowRailsService: WorkflowRailsService,
    workflowTokenService: WorkflowTokenService,
    executorManager: ExecutorManager,
    modelResolverService: ModelResolverService,
    userService: UserService,
  ) {
    this.#logger = logger;
    this.#prefixedLogger = withPrefix(logger, '[Duo Workflow Runner]');
    this.#workflowRailsService = workflowRailsService;
    this.#workflowTokenService = workflowTokenService;
    this.#executorManager = executorManager;
    this.#modelResolverService = modelResolverService;
    this.#userService = userService;

    const initialConfig = configService.get();
    this.#reconfigure(initialConfig);
    configService.onConfigChange((config) => this.#reconfigure(config));

    // Initialize user's default namespace in the background
    doNotAwait(this.#initializeUserDefaultNamespace());
  }

  async #initializeUserDefaultNamespace(): Promise<void> {
    try {
      const user = await this.#userService.getUser();
      this.#userPreferencesDefaultNamespacePath = user.duoDefaultNamespacePath;
    } catch (error) {
      this.#logger.debug('Failed to initialize user default namespace', error);
    }
  }

  #reconfigure(config: ClientConfig) {
    this.#workspaceFolders = config.workspaceFolders || [];
    this.#projectPath = config.projectPath || undefined;
    this.#defaultNamespacePath = config.duo?.agentPlatform?.defaultNamespace;
  }

  #getEffectiveNamespacePath(): string | undefined {
    if (this.#userPreferencesDefaultNamespacePath) {
      return this.#userPreferencesDefaultNamespacePath;
    }

    if (this.#defaultNamespacePath) {
      this.#logger.debug(
        `Config userPreferencesDefaultNamespacePath is empty, using IDE defaultNamespacePath: ${this.#defaultNamespacePath}`,
      );
    }
    return this.#defaultNamespacePath;
  }

  getProjectPath() {
    return this.#projectPath || '';
  }

  getNamespacePath() {
    return this.#getEffectiveNamespacePath() || '';
  }

  getServerCapabilities(workflowId: string, workflowType: WorkflowType): string[] | null {
    return this.#workflowTokenService.getServerCapabilities({ workflowType, workflowId });
  }

  async preCreateWorkflow(
    draftGoal: string,
    type: WorkflowType,
    workflowDefinition?: string,
    aiCatalogItemVersionId?: string,
    metadata?: Partial<WorkflowMetadata>,
    additionalOptions?: CreateWorkflowOptions,
  ): Promise<string> {
    if (!this.#workspaceFolders || this.#workspaceFolders.length === 0) {
      throw new Error('No workspace folders');
    }

    this.#logger.debug('Optimistically pre-creating workflow...');

    const workflowId = await this.#createWorkflow(
      draftGoal,
      type,
      workflowDefinition,
      aiCatalogItemVersionId,
      metadata,
      additionalOptions,
    );

    this.#logger.debug(
      `Workflow "${workflowId}" + auth token pre-created, ready for the user to submit their prompt.`,
    );

    return workflowId;
  }

  async createWorkflow(
    goal: string,
    type: WorkflowType,
    workflowDefinition?: string,
    aiCatalogItemVersionId?: string,
    metadata?: Partial<WorkflowMetadata>,
    additionalOptions?: CreateWorkflowOptions,
  ): Promise<string> {
    const effectiveProjectPath = metadata?.projectPath || this.#projectPath;
    const effectiveNamespacePath = effectiveProjectPath
      ? undefined
      : this.#getEffectiveNamespacePath();

    return this.#workflowRailsService.createWorkflow(
      goal,
      {
        project_id: effectiveProjectPath,
        namespace_id: effectiveNamespacePath,
      },
      type,
      workflowDefinition,
      aiCatalogItemVersionId ? tryParseGitLabGid(aiCatalogItemVersionId) : undefined,
      additionalOptions,
    );
  }

  async *runWorkflow(
    payload: RunWorkflowPayload,
  ): AsyncGenerator<WorkflowStreamEvent, void, unknown> {
    if (!this.#workspaceFolders?.length) {
      throw new Error('No workspace folders');
    }

    const selectedWorkspaceFolder =
      this.#workspaceFolders.find((f) => {
        // For file:// URIs, compare the filesystem path; for virtual URIs, compare the URI directly
        if (isFileSchemeUri(f.uri)) {
          return workspaceFolderPathFromUri(f.uri) === payload.metadata?.rootFsPath;
        }
        return f.uri === payload.metadata?.rootFsPath;
      }) ?? this.#workspaceFolders[0];

    const workspaceFolderPath = workspaceFolderPathFromUri(selectedWorkspaceFolder.uri);

    if (this.#workspaceFolders.length > 1) {
      this.#prefixedLogger.info(
        `More than one workspace folder detected. Using workspace folder ${workspaceFolderPath}`,
      );
    }

    const {
      goal,
      existingWorkflowId,
      preCreatedWorkflowId,
      type = WorkflowType.SOFTWARE_DEVELOPMENT,
      workflowDefinition,
      aiCatalogItemVersionId,
      metadata,
      additionalOptions,
    } = payload;

    let workflowId = existingWorkflowId || preCreatedWorkflowId;
    if (!workflowId) {
      workflowId = await this.#createWorkflow(
        goal,
        type,
        workflowDefinition,
        aiCatalogItemVersionId,
        metadata,
        additionalOptions,
      );
    }

    const executor = this.#executorManager.getExecutorForWorkflow(workflowId);

    const runOptions = {
      ...payload,
      workspaceFolderPath,
      workspaceFolderUri: selectedWorkspaceFolder.uri,
      workflowId,
    };

    try {
      this.#executorManager.clearExecutorDisposal(workflowId);

      yield* executor.runWorkflow(runOptions);
    } finally {
      this.#executorManager.setupExecutorDisposal(workflowId);
    }
  }

  stopWorkflow(workflowId: string) {
    const executor = this.#executorManager.getExecutorForWorkflow(workflowId);

    if (executor) {
      executor.stopWorkflow();
    }
  }

  interruptRunningCommand(workflowId: string) {
    const executor = this.#executorManager.getExecutorForWorkflow(workflowId);

    if (executor) {
      executor.interruptRunningCommand();
    }
  }

  isCommandRunning(workflowId: string): boolean {
    const executor = this.#executorManager.getExecutorForWorkflow(workflowId);
    return executor?.isCommandRunning() ?? false;
  }

  async getGraphqlData<T>(payload: WorkflowGraphqlPayload): Promise<T> {
    return this.#workflowRailsService.getGraphqlData<T>(payload);
  }

  async updateStatus(statusUpdate: DuoWorkflowStatusUpdate) {
    return this.#workflowRailsService.updateStatus(statusUpdate);
  }

  async updateAgentPrivileges(
    workflowId: string,
    agentPrivileges: number[],
    preApprovedAgentPrivileges: number[],
  ): Promise<string[]> {
    const data = await this.#workflowRailsService.getGraphqlData<UpdateAgentPrivilegesData>({
      operationName: 'updateAgentPrivileges',
      query: null,
      variables: {
        workflowId: generateGraphqlWorkflowId(workflowId),
        agentPrivileges,
        preApprovedAgentPrivileges,
      },
    });
    return data.updateDuoWorkflowAgentPrivileges.errors ?? [];
  }

  async sendEvent(workflowID: string, eventType: WorkflowEvent, message?: DuoWorkflowMessage) {
    return this.#workflowRailsService.sendEvent(workflowID, eventType, message);
  }

  async resolveModel(
    requestedModel: string,
    rootNamespaceId?: string,
  ): Promise<string | undefined> {
    return this.#modelResolverService.resolveModel(requestedModel, rootNamespaceId);
  }

  async #createWorkflow(
    goal: string,
    type: WorkflowType,
    workflowDefinition?: string,
    aiCatalogItemVersionId?: string,
    metadata?: Partial<WorkflowMetadata>,
    additionalOptions?: CreateWorkflowOptions,
  ): Promise<string> {
    const effectiveProjectPath = metadata?.projectPath || this.#projectPath;
    const effectiveNamespacePath = effectiveProjectPath
      ? undefined
      : this.#getEffectiveNamespacePath();

    const rootNamespaceId = metadata?.rootNamespaceId;

    // Always fetch a fresh token on workflow creation so that server_capabilities
    // reflect the latest state. The token fetch must not block workflow creation
    // on older instances that don't support /direct_access (< 18.1.0).
    const tokenPromise = this.#workflowRailsService
      .getWorkflowToken(type, rootNamespaceId, effectiveProjectPath)
      .catch((error) => {
        if (error instanceof InvalidInstanceVersionError) {
          this.#prefixedLogger.debug(
            'direct_access token not available (instance version too old)',
            error,
          );
          return null;
        }
        throw error;
      });

    const [createdWorkflowId, token] = await Promise.all([
      this.#workflowRailsService.createWorkflow(
        goal,
        {
          project_id: effectiveProjectPath,
          namespace_id: effectiveNamespacePath,
        },
        type,
        workflowDefinition,
        aiCatalogItemVersionId ? tryParseGitLabGid(aiCatalogItemVersionId) : undefined,
        additionalOptions,
      ),
      tokenPromise,
    ]);

    if (token) {
      this.#workflowTokenService.cacheToken(createdWorkflowId, type, token);
    }

    return createdWorkflowId;
  }
}
