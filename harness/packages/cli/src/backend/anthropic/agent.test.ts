import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  createFakePartial,
  drainAsyncGenerator,
  collectAsyncGenerator,
} from '@gitlab-org/test-utils';
import Anthropic from '@anthropic-ai/sdk';
import {
  Tool,
  ToolUseBlock,
  Message,
  MessageStreamEvent,
} from '@anthropic-ai/sdk/resources/messages.mjs';
import { MessageStream } from '@anthropic-ai/sdk/lib/MessageStream.mjs';
import type {
  McpToolApprovalController,
  McpToolSessionApprovalStore,
} from '@gitlab-org/ai-configuration';
import type { Logger } from '@gitlab-org/logging';
import type { AgentModeConfig } from '../../agents/agents';
import { UserActionType, SendPromptAction } from '../backend';
import { Agent } from './agent';
import type { Tools } from './tools';
import { SYSTEM_PROMPT } from './system_prompt';

function createMockStream(): MessageStream {
  return createFakePartial<MessageStream>({
    [Symbol.asyncIterator]: () => ({
      next: jest.fn<() => Promise<IteratorResult<MessageStreamEvent>>>().mockResolvedValue({
        done: true,
        value: undefined as unknown as MessageStreamEvent,
      }),
    }),
    finalMessage: jest.fn<() => Promise<Message>>().mockResolvedValue(
      createFakePartial<Message>({
        content: [],
        role: 'assistant',
      }),
    ),
  });
}

describe('Agent', () => {
  let agent: Agent;
  let mockAnthropicClient: Anthropic;
  let mockTools: Tools;
  let mockLogger: Logger;
  let mockStream: ReturnType<typeof jest.fn>;

  const readFileTool: Tool = {
    name: 'read_file',
    description: 'Read a file',
    input_schema: { type: 'object', properties: {} },
  };

  const editFileTool: Tool = {
    name: 'edit_file',
    description: 'Edit a file',
    input_schema: { type: 'object', properties: {} },
  };

  const shellCommandTool: Tool = {
    name: 'shell_command',
    description: 'Run a shell command',
    input_schema: { type: 'object', properties: {} },
  };

  const mcpTool: Tool = {
    name: 'mcp__server__do_thing',
    description: 'An MCP tool',
    input_schema: { type: 'object', properties: {} },
  };

  const allTools = [readFileTool, editFileTool, shellCommandTool, mcpTool];

  const sendPromptAction: SendPromptAction = {
    type: UserActionType.SendPrompt,
    prompt: 'hello',
  };

  beforeEach(() => {
    mockStream = jest.fn().mockReturnValue(createMockStream());

    mockAnthropicClient = createFakePartial<Anthropic>({
      messages: createFakePartial<Anthropic['messages']>({
        stream: mockStream,
      }),
    });

    mockTools = createFakePartial<Tools>({
      tools: allTools,
      executeTool: jest.fn<Tools['executeTool']>(),
      isMcpToolApprovedByConfig: jest
        .fn<Tools['isMcpToolApprovedByConfig']>()
        .mockReturnValue(false),
    });

    mockLogger = createFakePartial<Logger>({
      warn: jest.fn(),
    });

    agent = new Agent(
      mockAnthropicClient,
      mockTools,
      'claude-sonnet-4-20250514',
      mockLogger,
      createFakePartial<McpToolApprovalController>({}),
      createFakePartial<McpToolSessionApprovalStore>({
        isToolApproved: jest
          .fn<McpToolSessionApprovalStore['isToolApproved']>()
          .mockReturnValue(false),
      }),
      [],
      false,
    );
  });

  describe('sendMessageStream', () => {
    describe('when modeConfig is undefined (build mode)', () => {
      beforeEach(async () => {
        await drainAsyncGenerator(agent.sendMessageStream(sendPromptAction, undefined, undefined));
      });

      it('passes all tools to the anthropic client', () => {
        const callArgs = mockStream.mock.calls[0][0];

        expect(callArgs.tools).toEqual(allTools);
      });

      it('uses default SYSTEM_PROMPT in system blocks', () => {
        const callArgs = mockStream.mock.calls[0][0];
        const systemTexts: string[] = callArgs.system.map((block: { text: string }) => block.text);

        expect(systemTexts[0]).toBe(SYSTEM_PROMPT);
      });
    });

    describe('when modeConfig is provided (plan mode)', () => {
      const planModeConfig: AgentModeConfig = {
        name: 'plan',
        systemPrompt: 'You are in PLAN MODE.',
        allowedTools: ['read_file'],
        excludeMcp: true,
      };

      beforeEach(async () => {
        await drainAsyncGenerator(
          agent.sendMessageStream(sendPromptAction, undefined, planModeConfig),
        );
      });

      it('only passes allowed tools to the anthropic client', () => {
        const callArgs = mockStream.mock.calls[0][0];

        expect(callArgs.tools).toEqual([readFileTool]);
      });

      it('uses modeConfig.systemPrompt in system blocks', () => {
        const callArgs = mockStream.mock.calls[0][0];
        const systemTexts: string[] = callArgs.system.map((block: { text: string }) => block.text);

        expect(systemTexts[0]).toBe('You are in PLAN MODE.');
      });
    });

    describe('when modeConfig changes between calls', () => {
      it('uses the new modeConfig for subsequent calls', async () => {
        const planModeConfig: AgentModeConfig = {
          name: 'plan',
          systemPrompt: 'You are in PLAN MODE.',
          allowedTools: ['read_file'],
          excludeMcp: true,
        };

        await drainAsyncGenerator(
          agent.sendMessageStream(sendPromptAction, undefined, planModeConfig),
        );

        const firstCallArgs = mockStream.mock.calls[0][0];
        expect(firstCallArgs.tools).toEqual([readFileTool]);
        expect(firstCallArgs.system[0].text).toBe('You are in PLAN MODE.');

        await drainAsyncGenerator(agent.sendMessageStream(sendPromptAction, undefined, undefined));

        const secondCallArgs = mockStream.mock.calls[1][0];
        expect(secondCallArgs.tools).toEqual(allTools);
        expect(secondCallArgs.system[0].text).toBe(SYSTEM_PROMPT);
      });
    });
  });

  describe('MCP tool approval', () => {
    const mcpToolUseBlock: ToolUseBlock = {
      id: 'tool-1',
      type: 'tool_use',
      name: mcpTool.name,
      input: { query: 'test' },
    };

    function createAgentWithApproval(configApproved: boolean): Agent {
      const toolStream = createFakePartial<MessageStream>({
        [Symbol.asyncIterator]: () => ({
          next: jest.fn<() => Promise<IteratorResult<MessageStreamEvent>>>().mockResolvedValue({
            done: true,
            value: undefined as unknown as MessageStreamEvent,
          }),
        }),
        finalMessage: jest
          .fn<() => Promise<Message>>()
          .mockResolvedValue(
            createFakePartial<Message>({ content: [mcpToolUseBlock], role: 'assistant' }),
          ),
      });

      const stream = jest
        .fn()
        .mockReturnValueOnce(toolStream)
        .mockReturnValue(createMockStream()) as Anthropic['messages']['stream'];
      const client = createFakePartial<Anthropic>({
        messages: createFakePartial<Anthropic['messages']>({ stream }),
      });

      return new Agent(
        client,
        createFakePartial<Tools>({
          tools: allTools,
          executeTool: jest.fn<Tools['executeTool']>().mockResolvedValue({ result: 'ok' }),
          isMcpToolApprovedByConfig: jest
            .fn<Tools['isMcpToolApprovedByConfig']>()
            .mockReturnValue(configApproved),
        }),
        'claude-sonnet-4-20250514',
        mockLogger,
        createFakePartial<McpToolApprovalController>({}),
        createFakePartial<McpToolSessionApprovalStore>({
          isToolApproved: jest
            .fn<McpToolSessionApprovalStore['isToolApproved']>()
            .mockReturnValue(false),
        }),
        [],
        true,
      );
    }

    it('skips approval for MCP tools approved by config', async () => {
      const events = await collectAsyncGenerator(
        createAgentWithApproval(true).sendMessageStream(sendPromptAction, undefined, undefined),
      );

      expect(events.filter((e) => e.type === 'tool_awaiting_approval')).toHaveLength(0);
      expect(events.filter((e) => e.type === 'tool_start')).toHaveLength(1);
    });

    it('requests approval for MCP tools not approved by config', async () => {
      const events = await collectAsyncGenerator(
        createAgentWithApproval(false).sendMessageStream(sendPromptAction, undefined, undefined),
      );

      expect(events.filter((e) => e.type === 'tool_awaiting_approval')).toHaveLength(1);
    });
  });
});
