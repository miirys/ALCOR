import Anthropic from '@anthropic-ai/sdk';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { GitLabApiService } from '@gitlab-org/core';
import { AIContextItem, SystemContextManager } from '@gitlab-org/ai-context';
import {
  McpToolApprovalController,
  McpToolSessionApprovalStore,
} from '@gitlab-org/ai-configuration';
import {
  CliBackend,
  AgentEventType,
  UserAction,
  type AgentEvent,
  type BackendInitResult,
  SendPromptAction,
  UserActionType,
} from '../backend';
import { getAgentModeConfig } from '../../agents/agents';
import { ToolInputFormatterService } from '../tool_input_formatter';
import type { ParsedCliInput } from '../../parse';
import { ModelManager } from '../../model_manager';
import { type AnthropicModel } from './anthropic_parsed_options';
import { Agent } from './agent';
import { Tools } from './tools';

interface DirectAccessResponse {
  headers: Record<string, string>;
  token: string;
}

export class AnthropicSdkBackend implements CliBackend {
  readonly id = 'anthropic';

  #cliInput: ParsedCliInput;

  #logger: Logger;

  #tools: Tools;

  #apiService: GitLabApiService;

  #toolInputFormatter: ToolInputFormatterService;

  #systemContextManager: SystemContextManager;

  #mcpToolApprovalController: McpToolApprovalController;

  #mcpToolApprovalStore: McpToolSessionApprovalStore;

  #agent: Agent | undefined;

  #modelChangedUnsubscribe?: () => void;

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
    this.#logger = withPrefix(logger, '[AnthropicSdkBackend]');
    this.#tools = tools;
    this.#apiService = apiService;
    this.#toolInputFormatter = toolInputFormatter;
    this.#systemContextManager = systemContextManager;
    this.#mcpToolApprovalController = mcpToolApprovalController;
    this.#mcpToolApprovalStore = mcpToolApprovalStore;
    this.#modelManager = modelManager;
  }

  async preinitialize(): Promise<void> {
    try {
      // Pre-warm MCP servers in background
      await this.#tools.initialize();
      this.#logger.info('MCP pre-initialization completed');
    } catch (error) {
      this.#logger.warn('MCP pre-initialization failed, will retry during initialize()', error);
      // Don't throw - this is optimization, initialize() will retry
    }
  }

  /**
   * Backend initialisation specific to Anthropic backend.
   * Common initialisation already run at this point via CliInitialisationService
   */
  async initialize(existingSessionId?: string): Promise<BackendInitResult> {
    if (existingSessionId) {
      throw new Error('Anthropic backend does not yet support resuming an existing session');
    }

    await this.#modelManager.initialize();

    const [clientInitialization, toolInitialization] = await Promise.allSettled([
      this.#initializeAnthropicClient(this.#modelManager.getModel().modelRef),
      this.#tools.initialize(),
    ]);

    if (clientInitialization.status === 'rejected') {
      this.#logger.error('AnthropicSdkBackend initialization failed', clientInitialization.reason);
      throw clientInitialization.reason;
    }

    if (toolInitialization.status === 'rejected') {
      this.#logger.error(
        'Tools initialization failed, continuing without MCP tools',
        toolInitialization.reason,
      );
      // Don't throw - tool/MCP initialization failures shouldn't prevent the backend from starting
    }

    if (!this.#agent) {
      throw new Error('Agent not initialized after successful client initialization');
    }

    // Re-fetch system context with workflow context so hook providers can run
    try {
      const hookContext = await this.#systemContextManager.getSystemContextItems({
        sessionId: this.#agent.sessionId,
        cwd: this.#cliInput.cwd,
        source: 'startup', // Anthropic backend doesn't support resume yet
      });
      this.#agent.setSystemContext(hookContext);
      this.#logger.debug(
        `Updated system context with workflow context (${hookContext.length} items)`,
      );
    } catch (error) {
      this.#logger.warn('Failed to fetch hook system context, using initial context', error);
    }

    this.#modelChangedUnsubscribe = this.#modelManager.onModelChanged((model) => {
      const normalized = this.#normalizeModel(model.modelRef);
      this.#logger.info(`Model changed to "${normalized}", updating agent`);
      this.#agent?.setModel(normalized);
    });

    return { sessionId: this.#agent.sessionId };
  }

  async *sendMessageStream(
    action: UserAction,
    signal?: AbortSignal,
  ): AsyncGenerator<AgentEvent, void, void> {
    if (!this.#agent) {
      throw new Error('Agent not initialized');
    }

    let userAction = action;
    if (this.#cliInput.command.name === 'run') {
      userAction = {
        type: UserActionType.SendPrompt,
        prompt: this.#cliInput.command.goal,
        aiContextItems: this.#cliInput.command.aiContextItems,
      } satisfies SendPromptAction;
    }

    const agentMode =
      userAction.type === UserActionType.SendPrompt ? userAction.agentMode : undefined;
    const modeConfig = getAgentModeConfig(agentMode);

    if (modeConfig) {
      this.#logger.info(
        `Agent mode: ${modeConfig.name} (${modeConfig.allowedTools.length} tools, MCP ${modeConfig.excludeMcp ? 'excluded' : 'included'})`,
      );
    }

    try {
      for await (const event of this.#agent.sendMessageStream(userAction, signal, modeConfig)) {
        switch (event.type) {
          case 'text_chunk':
            yield {
              type: AgentEventType.TextChunk,
              messageId: event.id,
              content: event.content,
              timestamp: Date.now(),
            };
            break;

          case 'tool_start':
            yield {
              type: AgentEventType.ToolStart,
              toolId: event.id,
              name: event.name,
              input: await this.#toolInputFormatter.formatToolInput(
                event.name,
                event.input as Record<string, unknown>,
              ),
              timestamp: Date.now(),
            };
            break;

          case 'tool_complete':
            yield {
              type: AgentEventType.ToolComplete,
              toolId: event.id,
              result: event.result.result,
              error: event.result.error,
              timestamp: Date.now(),
            };
            break;

          case 'tool_awaiting_approval':
            yield {
              type: AgentEventType.ToolAwaitingApproval,
              toolId: event.id,
              toolName: event.name,
              input: await this.#toolInputFormatter.formatToolInput(
                event.name,
                event.input as Record<string, unknown>,
              ),
              content: event.name,
              timestamp: Date.now(),
              availableScopes: ['once', 'session'], // Anthropic backend always supports session approval
            };
            break;

          case 'error':
            yield { type: AgentEventType.Error, message: event.error, timestamp: Date.now() };
            return;

          default:
            break;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      yield { type: AgentEventType.Error, message: errorMessage, timestamp: Date.now() };
    }
  }

  dispose(): void {
    this.#modelChangedUnsubscribe?.();
    this.#modelChangedUnsubscribe = undefined;
    this.#agent = undefined;
    this.#logger.debug('AnthropicSdkBackend disposed');
  }

  #normalizeModel(model: string): AnthropicModel {
    return model.replaceAll('_', '-') as AnthropicModel;
  }

  async #initializeAnthropicClient(model: AnthropicModel): Promise<void> {
    const [directAccess, systemContext] = await Promise.all([
      this.#fetchDirectAccessToken(),
      this.#initializeSystemContext(),
    ]);

    const anthropicClient = new Anthropic({
      baseURL: 'https://cloud.gitlab.com/ai/v1/proxy/anthropic/',
      defaultHeaders: directAccess.headers,
      authToken: directAccess.token,
    });

    // Headless workflow execution and dangerously-skip-permissions mode should not allow tool approval prompts
    const allowAgentToRequestUser =
      this.#cliInput.command.name !== 'run' && !this.#cliInput.dangerouslySkipPermissions;

    // Normalize model name: GitLab model identifiers use underscores (e.g. claude_sonnet_4_6)
    // but the Anthropic API expects hyphens (e.g. claude-sonnet-4-6)
    const normalizedModel = this.#normalizeModel(model);

    this.#agent = new Agent(
      anthropicClient,
      this.#tools,
      normalizedModel,
      this.#logger,
      this.#mcpToolApprovalController,
      this.#mcpToolApprovalStore,
      systemContext,
      allowAgentToRequestUser,
    );
  }

  async #initializeSystemContext(): Promise<AIContextItem[]> {
    try {
      await this.#systemContextManager.precalculateOnInitialized();
      return await this.#systemContextManager.getSystemContextItems();
    } catch (error) {
      throw new Error(
        `Failed to get system context ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async #fetchDirectAccessToken(): Promise<DirectAccessResponse> {
    try {
      const response = await this.#apiService.fetchFromApi({
        type: 'rest',
        method: 'POST',
        path: 'api/v4/ai/third_party_agents/direct_access',
        body: {},
      });

      return response as DirectAccessResponse;
    } catch (error) {
      throw new Error(
        `Failed to fetch direct access token: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
