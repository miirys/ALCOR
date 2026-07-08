import {
  MessageParam,
  Tool,
  ToolUseBlock,
  TextBlockParam,
} from '@anthropic-ai/sdk/resources/messages.mjs';
import { AIContextItem } from '@gitlab-org/ai-context';
import { v4 as uuidv4 } from 'uuid';
import {
  McpToolApprovalController,
  McpToolName,
  WorkflowId,
  McpToolSessionApprovalStore,
} from '@gitlab-org/ai-configuration';
import { Logger } from '@gitlab-org/logging';
import type { AgentModelClient, MinimalMessageStream } from '../../providers/openai_compat_client';
import { UserAction, UserActionType, ApprovalScope } from '../backend';
import type { AgentModeConfig } from '../../agents/agents';
import type { AnthropicModel } from './anthropic_parsed_options';
import { ToolResult, Tools } from './tools';
import { SYSTEM_PROMPT } from './system_prompt';

export type AnthropicAgentEvent = { id: string } & (
  | { type: 'text_chunk'; content: string }
  | { type: 'tool_start'; name: string; input: unknown }
  | { type: 'tool_complete'; name: string; result: ToolResult }
  | { type: 'tool_awaiting_approval'; name: string; input: unknown }
  | { type: 'error'; error: string }
);

type ExecutionPhase = 'idle' | 'processing_turn' | 'processing_tools' | 'awaiting_approval';

interface ExecutionState {
  phase: ExecutionPhase;
  remainingTurns: number;
  toolsToProcess: ToolUseBlock[];
  awaitingApprovalTool: ToolUseBlock | null;
}

export class Agent {
  #context: MessageParam[] = [];

  #anthropicClient: AgentModelClient;

  #tools: Tools;

  #model: AnthropicModel;

  #logger: Logger;

  #systemContext: AIContextItem[] = [];

  #maxTurns = 999;

  #sessionApprovedTools: Set<string> = new Set();

  #mcpToolApprovalController: McpToolApprovalController;

  #mcpToolApprovalStore: McpToolSessionApprovalStore;

  // TODO: integrate actual session management, ensure multiple concurrent sessions can run
  // https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/1572
  #sessionId: string;

  #executionState: ExecutionState = {
    phase: 'idle',
    remainingTurns: this.#maxTurns,
    toolsToProcess: [],
    awaitingApprovalTool: null,
  };

  #abortSignal?: AbortSignal;

  #allowAgentToRequestUser: boolean;

  #activeModeConfig?: AgentModeConfig;

  constructor(
    anthropicClient: AgentModelClient,
    tools: Tools,
    model: AnthropicModel,
    logger: Logger,
    mcpToolApprovalController: McpToolApprovalController,
    mcpToolApprovalStore: McpToolSessionApprovalStore,
    systemContext: AIContextItem[] = [],
    allowAgentToRequestUser: boolean = true,
  ) {
    this.#anthropicClient = anthropicClient;
    this.#tools = tools;
    this.#model = model;
    this.#logger = logger;
    this.#mcpToolApprovalController = mcpToolApprovalController;
    this.#mcpToolApprovalStore = mcpToolApprovalStore;
    this.#sessionId = uuidv4();
    this.#systemContext = systemContext;
    this.#allowAgentToRequestUser = allowAgentToRequestUser;
  }

  setModel(model: AnthropicModel): void {
    this.#model = model;
  }

  setSystemContext(items: AIContextItem[]): void {
    this.#systemContext = items;
  }

  async *sendMessageStream(
    action: UserAction,
    signal?: AbortSignal,
    modeConfig?: AgentModeConfig,
  ): AsyncGenerator<AnthropicAgentEvent, void, unknown> {
    this.#abortSignal = signal;
    this.#activeModeConfig = modeConfig;
    if (action.type === UserActionType.SendPrompt) {
      for (const item of action.aiContextItems || []) {
        this.#context.push({
          role: 'user',
          content: `User added additional context:
<additional_context>
  <id>${item.id}</id>
  <category>${item.category}</category>
  <content>${item.content}</content>
</additional_context>`,
        });
      }
      this.#context.push({ role: 'user', content: action.prompt });
      this.#executionState.phase = 'processing_turn';
      this.#executionState.remainingTurns = this.#maxTurns;
    } else if (action.type === UserActionType.SendToolApproval) {
      yield* this.#handleApprovalAction(action);
    }

    yield* this.#resume();
  }

  async *#resume(): AsyncGenerator<AnthropicAgentEvent, void, unknown> {
    while (
      this.#executionState.phase !== 'idle' &&
      this.#executionState.phase !== 'awaiting_approval' &&
      !this.#abortSignal?.aborted
    ) {
      if (this.#executionState.phase === 'processing_turn') {
        yield* this.#processTurn();
      } else if (this.#executionState.phase === 'processing_tools') {
        yield* this.#processNextTool();
      }
    }

    // If aborted, yield error and reset state
    if (this.#abortSignal?.aborted) {
      yield {
        id: Date.now().toString(),
        type: 'error',
        error: 'Request cancelled by user',
      };
      this.#executionState.phase = 'idle';
    }
  }

  async *#processTurn(): AsyncGenerator<AnthropicAgentEvent, void, unknown> {
    if (this.#executionState.remainingTurns <= 0) {
      yield {
        id: `${Date.now()}`,
        type: 'error',
        error: `The agent ran out of its ${this.#maxTurns} tool call allowance, you can say "go on" to make it continue.`,
      };
      this.#executionState.phase = 'idle';
      return;
    }

    try {
      const messageId = `msg-${Date.now()}`;

      const stream = this.#anthropicClient.messages.stream(
        {
          model: this.#model,
          max_tokens: 4000,
          system: this.#buildSystemPrompt(),
          messages: this.#context,
          tools: this.#getActiveTools(),
        },
        { signal: this.#abortSignal },
      );

      yield* this.#streamTextChunks(stream, messageId);

      const message = await stream.finalMessage();
      this.#context.push({ role: 'assistant', content: message.content });

      // Extract tools to process
      const tools = message.content.filter(
        (block): block is ToolUseBlock => block.type === 'tool_use',
      );

      if (tools.length > 0) {
        this.#executionState.toolsToProcess = tools;
        this.#executionState.phase = 'processing_tools';
      } else {
        // No tools, we're done
        this.#executionState.phase = 'idle';
      }
    } catch (error) {
      // Handle AbortError specially
      if (error instanceof Error && error.name === 'AbortError') {
        yield {
          id: Date.now().toString(),
          type: 'error',
          error: 'Request cancelled by user',
        };
        this.#executionState.phase = 'idle';
        return;
      }

      // Handle other errors
      yield {
        id: Date.now().toString(),
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      this.#executionState.phase = 'idle';
      throw error;
    }
  }

  async *#streamTextChunks(
    stream: MinimalMessageStream,
    messageId: string,
  ): AsyncGenerator<AnthropicAgentEvent, void, unknown> {
    for await (const chunk of stream) {
      const delta = chunk.delta as { type?: string; text?: string } | undefined;
      if (chunk.type === 'content_block_delta' && delta?.type === 'text_delta') {
        yield {
          id: messageId,
          type: 'text_chunk',
          content: delta.text ?? '',
        };
      }
    }
  }

  async *#processNextTool(): AsyncGenerator<AnthropicAgentEvent, void, unknown> {
    // Get the next tool to process
    const toolUse = this.#executionState.toolsToProcess.shift();

    if (!toolUse) {
      // No more tools to process - decide what to do next
      if (this.#executionState.remainingTurns > 0) {
        // Continue to next turn
        this.#executionState.remainingTurns -= 1;
        this.#executionState.phase = 'processing_turn';
      } else {
        // Out of turns
        this.#executionState.phase = 'idle';
      }
      return;
    }

    // Check if tool needs approval
    if (this.#needsApproval(toolUse.name)) {
      // Tool needs approval - store it and wait
      this.#executionState.awaitingApprovalTool = toolUse;
      yield {
        id: toolUse.id,
        type: 'tool_awaiting_approval',
        name: toolUse.name,
        input: toolUse.input,
      };
      this.#executionState.phase = 'awaiting_approval';
      return;
    }

    // Tool is auto-approved - emit tool_start and execute
    yield {
      id: toolUse.id,
      type: 'tool_start',
      name: toolUse.name,
      input: toolUse.input,
    };

    yield* this.#executeAndRecordTool(toolUse);

    // Continue processing remaining tools (stay in 'processing_tools' phase)
    // The resume loop will call this method again
  }

  async *#handleApprovalAction(
    action:
      | { approved: true; scope: ApprovalScope; toolId: string }
      | { approved: false; toolId: string; rejectionReason?: string },
  ): AsyncGenerator<AnthropicAgentEvent, void, unknown> {
    const toolUse = this.#executionState.awaitingApprovalTool;

    if (!toolUse) {
      yield {
        id: Date.now().toString(),
        type: 'error',
        error: 'No pending tool to approve',
      };
      return;
    }

    if (toolUse.id !== action.toolId) {
      throw new Error(
        `Toll approval mismatch: awaiting approval - ${toolUse.id}, approved - ${action.toolId}`,
      );
    }

    // Clear the awaiting tool
    this.#executionState.awaitingApprovalTool = null;

    if (action.approved) {
      // Add to session approvals if scope is 'session'
      if (action.scope === 'session') {
        if (McpToolName.is(toolUse.name)) {
          await this.#mcpToolApprovalController.approveToolForSession(
            this.#sessionId as WorkflowId,
            toolUse.name as McpToolName,
          );
        } else {
          this.#sessionApprovedTools.add(toolUse.name);
        }
      }

      // Emit tool_start (approval gate didn't emit it)
      yield {
        id: toolUse.id,
        type: 'tool_start',
        name: toolUse.name,
        input: toolUse.input,
      };

      // Execute and record tool using shared method
      yield* this.#executeAndRecordTool(toolUse);
    } else {
      // Tool was denied, add error to context
      this.#context.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: action.rejectionReason
              ? `Tool execution was denied by user.\nUser's reason: ${action.rejectionReason}`
              : 'Tool execution was denied by user',
            is_error: true,
          },
        ],
      });
    }

    // Resume processing remaining tools (or continue to next turn)
    this.#executionState.phase = 'processing_tools';
  }

  async *#executeAndRecordTool(
    toolUse: ToolUseBlock,
  ): AsyncGenerator<AnthropicAgentEvent, void, unknown> {
    // Execute the tool
    const result = await this.#tools.executeTool(toolUse);

    // Yield tool_complete event
    yield {
      id: toolUse.id,
      type: 'tool_complete',
      name: toolUse.name,
      result,
    };

    // Add tool result to context
    this.#context.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result.result + (result.error ? `\nError: ${result.error}` : ''),
        },
      ],
    });
  }

  clearContext(): void {
    this.#context = [];
    this.#executionState = {
      phase: 'idle',
      remainingTurns: this.#maxTurns,
      toolsToProcess: [],
      awaitingApprovalTool: null,
    };
  }

  get sessionId(): string {
    return this.#sessionId;
  }

  #needsApproval(toolName: string): boolean {
    if (!this.#allowAgentToRequestUser) {
      return false;
    }

    if (McpToolName.is(toolName)) {
      if (this.#tools.isMcpToolApprovedByConfig(toolName)) {
        return false;
      }
      return !this.#mcpToolApprovalStore.isToolApproved(
        this.#sessionId as WorkflowId,
        McpToolName.parse(toolName),
      );
    }

    const toolsRequiringApproval = ['shell_command'];

    return toolsRequiringApproval.includes(toolName) && !this.#sessionApprovedTools.has(toolName);
  }

  #getActiveTools(): Tool[] {
    if (!this.#activeModeConfig) {
      return this.#tools.tools;
    }
    const allowed = new Set(this.#activeModeConfig.allowedTools);
    const availableNames = new Set(this.#tools.tools.map((t) => t.name));
    const missing = this.#activeModeConfig.allowedTools.filter((name) => !availableNames.has(name));
    if (missing.length > 0) {
      this.#logger.warn(
        `Agent mode "${this.#activeModeConfig.name}" references non-existent tools: ${missing.join(', ')}`,
      );
    }
    return this.#tools.tools.filter((t) => allowed.has(t.name));
  }

  #buildSystemPrompt(): TextBlockParam[] {
    const basePrompt = this.#activeModeConfig?.systemPrompt ?? SYSTEM_PROMPT;

    const systemBlocks: TextBlockParam[] = [
      {
        type: 'text',
        text: basePrompt,
      },
      {
        type: 'text',
        text: `<model_info><model_identifier>${this.#model}</model_identifier></model_info>`,
      },
    ];

    /* TODO: add more system context providers for parity with DWS
    <project>
      Information for the current GitLab project the USER is working on
      <project_id>42</project_id>
      <project_name>awesome-app</project_name>
      <project_url>https://gitlab.com/mycompany/awesome-app</project_url>
      <project_languages>Python: 65.3%, JavaScript: 28.1%, CSS: 6.6%</project_languages>
    </project>
    <namespace>
      Information for the current GitLab namespace the USER is working on
      <namespace_id>123</namespace_id>
      <namespace_description>MyCompany's main development group</namespace_description>
      <namespace_name>mycompany</namespace_name>
      <namespace_url>https://gitlab.com/mycompany</namespace_url>
    </namespace>
    */

    for (const item of this.#systemContext) {
      systemBlocks.push({
        type: 'text',
        text: `<system_context category="${item.category}" id="${item.id}">${item.content}</system_context>`,
      });
    }

    return systemBlocks;
  }
}
