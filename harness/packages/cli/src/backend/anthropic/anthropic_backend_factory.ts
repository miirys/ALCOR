import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger } from '@gitlab-org/logging';
import { GitLabApiService } from '@gitlab-org/core';
import { SystemContextManager } from '@gitlab-org/ai-context';
import {
  McpToolApprovalController,
  McpToolSessionApprovalStore,
} from '@gitlab-org/ai-configuration';
import { BackendFactory } from '../backend_factory';
import { ParsedCliInput } from '../../parse';
import { ToolInputFormatterService } from '../tool_input_formatter';
import { ModelManager } from '../../model_manager';
import { Tools } from './tools';
import { AnthropicSdkBackend } from './anthropic_backend';

@Implements(BackendFactory)
@Service({
  dependencies: [
    ParsedCliInput,
    Logger,
    GitLabApiService,
    Tools,
    ToolInputFormatterService,
    SystemContextManager,
    McpToolApprovalController,
    McpToolSessionApprovalStore,
    ModelManager,
  ],
  lifetime: ServiceLifetime.Singleton,
})
export class AnthropicBackendFactory implements BackendFactory {
  #cliInput: ParsedCliInput;

  #logger: Logger;

  #apiService: GitLabApiService;

  #tools: Tools;

  #toolInputFormatter: ToolInputFormatterService;

  #systemContextManager: SystemContextManager;

  #mcpToolApprovalController: McpToolApprovalController;

  #mcpToolApprovalStore: McpToolSessionApprovalStore;

  #modelManager: ModelManager;

  constructor(
    cliInput: ParsedCliInput,
    logger: Logger,
    apiService: GitLabApiService,
    tools: Tools,
    toolInputFormatter: ToolInputFormatterService,
    systemContextManager: SystemContextManager,
    mcpToolApprovalController: McpToolApprovalController,
    mcpToolApprovalStore: McpToolSessionApprovalStore,
    modelManager: ModelManager,
  ) {
    this.#cliInput = cliInput;
    this.#logger = logger;
    this.#apiService = apiService;
    this.#tools = tools;
    this.#toolInputFormatter = toolInputFormatter;
    this.#systemContextManager = systemContextManager;
    this.#mcpToolApprovalController = mcpToolApprovalController;
    this.#mcpToolApprovalStore = mcpToolApprovalStore;
    this.#modelManager = modelManager;
  }

  create(): AnthropicSdkBackend {
    return new AnthropicSdkBackend(
      this.#cliInput,
      this.#logger,
      this.#apiService,
      this.#tools,
      this.#toolInputFormatter,
      this.#systemContextManager,
      this.#mcpToolApprovalController,
      this.#mcpToolApprovalStore,
      this.#modelManager,
    );
  }
}
