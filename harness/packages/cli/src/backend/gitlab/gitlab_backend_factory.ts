import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger } from '@gitlab-org/logging';
import { WorkflowRunner } from '@gitlab-lsp/workflow-api';
import { ConfigService } from '@gitlab-org/config';
import { ProjectService } from '@gitlab-org/core';
import { SystemContextManager } from '@gitlab-org/ai-context';
import { McpManagerWorkflowExecutorAdaptor } from '@gitlab-org/ai-configuration';
import { DuoAgentPlatformTracker } from '@gitlab-org/telemetry';
import { BackendFactory } from '../backend_factory';
import { ParsedCliInput } from '../../parse';
import { ToolInputFormatterService } from '../tool_input_formatter';
import { GitLabParsedOptions } from './gitlab_parsed_options';
import { WorkflowEventMapperService } from './workflow_event_mapper';
import { GitLabBackend } from './gitlab_backend';
import { GitLabModelManager } from './gitlab_model_manager';
import { RootNamespaceIdService } from './root_namespace_id_service';

@Implements(BackendFactory)
@Service({
  dependencies: [
    Logger,
    WorkflowRunner,
    ConfigService,
    ParsedCliInput,
    GitLabParsedOptions,
    ProjectService,
    RootNamespaceIdService,
    ToolInputFormatterService,
    SystemContextManager,
    McpManagerWorkflowExecutorAdaptor,
    GitLabModelManager,
    DuoAgentPlatformTracker,
  ],
  lifetime: ServiceLifetime.Singleton,
})
export class GitLabBackendFactory implements BackendFactory {
  #logger: Logger;

  #workflowRunner: WorkflowRunner;

  #configService: ConfigService;

  #cliInput: ParsedCliInput;

  #backendOpts: GitLabParsedOptions;

  #projectService: ProjectService;

  #rootNamespaceIdService: RootNamespaceIdService;

  #toolInputFormatter: ToolInputFormatterService;

  #systemContextManager: SystemContextManager;

  #mcpManager: McpManagerWorkflowExecutorAdaptor;

  #modelManager: GitLabModelManager;

  #duoAgentPlatformTracker: DuoAgentPlatformTracker;

  constructor(
    logger: Logger,
    workflowRunner: WorkflowRunner,
    configService: ConfigService,
    cliInput: ParsedCliInput,
    backendOpts: GitLabParsedOptions,
    projectService: ProjectService,
    rootNamespaceIdService: RootNamespaceIdService,
    toolInputFormatter: ToolInputFormatterService,
    systemContextManager: SystemContextManager,
    mcpManager: McpManagerWorkflowExecutorAdaptor,
    modelManager: GitLabModelManager,
    duoAgentPlatformTracker: DuoAgentPlatformTracker,
  ) {
    this.#logger = logger;
    this.#workflowRunner = workflowRunner;
    this.#configService = configService;
    this.#cliInput = cliInput;
    this.#backendOpts = backendOpts;
    this.#projectService = projectService;
    this.#rootNamespaceIdService = rootNamespaceIdService;
    this.#toolInputFormatter = toolInputFormatter;
    this.#systemContextManager = systemContextManager;
    this.#mcpManager = mcpManager;
    this.#modelManager = modelManager;
    this.#duoAgentPlatformTracker = duoAgentPlatformTracker;
  }

  create(): GitLabBackend {
    const workflowEventMapper = new WorkflowEventMapperService(
      this.#toolInputFormatter,
      this.#logger,
    );

    return new GitLabBackend(
      this.#logger,
      this.#workflowRunner,
      this.#configService,
      this.#cliInput,
      this.#backendOpts,
      this.#projectService,
      this.#rootNamespaceIdService,
      workflowEventMapper,
      this.#systemContextManager,
      this.#mcpManager,
      this.#modelManager,
      this.#duoAgentPlatformTracker,
    );
  }
}
