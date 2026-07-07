import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import {
  extractUiChatLog,
  type DuoWorkflowEvent,
  type ToolInputDisplay,
  type WorkflowMessage,
  type WorkflowRequest,
  type WorkflowTool,
  type ChatLog,
} from '@gitlab-lsp/workflow-api';
import { EditFileFormatter } from '@gitlab-org/workflow-executor/node';
import { FileAccessService } from '@gitlab-org/fs';
import {
  standardFlowUiChatLog,
  developerFlowUiChatLog,
  buildCheckpointFromUiChatLog,
} from '@gitlab-lsp/workflow-api/test_fixtures';
import { AgentEventType, UserEventType, type AgentEvent, type SessionEvent } from '../backend';
import { ToolInputFormatterService } from '../tool_input_formatter';
import type { ParsedCliInput } from '../../parse';
import { WorkflowEventMapperService } from './workflow_event_mapper';

describe('WorkflowEventMapperService', () => {
  let service: WorkflowEventMapperService;
  let mockToolInputFormatterService: ToolInputFormatterService;
  let testLogger: TestLogger;
  let mockFormatToolInput: jest.Mock<
    (toolName: string, args: Record<string, unknown>) => Promise<ToolInputDisplay>
  >;

  beforeEach(() => {
    mockFormatToolInput = jest
      .fn<(toolName: string, args: Record<string, unknown>) => Promise<ToolInputDisplay>>()
      .mockResolvedValue({ tool: 'generic', name: 'test_tool', args: {} });

    mockToolInputFormatterService = createFakePartial<ToolInputFormatterService>({
      formatToolInput: mockFormatToolInput,
    });

    testLogger = new TestLogger();

    service = new WorkflowEventMapperService(mockToolInputFormatterService, testLogger);
  });

  function createCheckpoint(uiChatLog: ChatLog[]): string {
    return JSON.stringify({
      channel_values: {
        ui_chat_log: uiChatLog,
      },
    });
  }

  function mapMessagesWithService(messages: ChatLog[]): Promise<AgentEvent[]> {
    const duoEvent = createFakePartial<DuoWorkflowEvent>({
      checkpoint: createCheckpoint(messages),
    });
    return service.mapWorkflowEvent(duoEvent, ['once']); // Default to 'once' for tests
  }

  describe('mapWorkflowEvent', () => {
    describe('when checkpoint is invalid JSON', () => {
      let events: AgentEvent[];

      beforeEach(async () => {
        const duoEvent = createFakePartial<DuoWorkflowEvent>({
          checkpoint: 'invalid json {',
          agentContextUsage: { agent: { totalTokens: 73, maxTokens: 100 } },
        });
        events = await service.mapWorkflowEvent(duoEvent, ['once']);
      });

      it('should return empty array', () => {
        expect(events).toEqual([]);
      });

      it('should not emit a token usage event when the checkpoint fails to parse', () => {
        expect(events.some((e) => e.type === AgentEventType.TokenUsage)).toBe(false);
      });

      it('should log error', () => {
        expect(testLogger.errorLogs).toHaveLength(1);
        expect(testLogger.errorLogs[0].message).toBe('Failed to parse workflow checkpoint');
        expect(testLogger.errorLogs[0].error).toBeInstanceOf(Error);
      });
    });

    describe('when checkpoint has no ui_chat_log', () => {
      let events: AgentEvent[];

      beforeEach(async () => {
        const duoEvent = createFakePartial<DuoWorkflowEvent>({
          checkpoint: JSON.stringify({ channel_values: {} }),
        });
        events = await service.mapWorkflowEvent(duoEvent, ['once']);
      });

      it('should return empty array', () => {
        expect(events).toEqual([]);
      });
    });

    describe('when checkpoint is empty string', () => {
      let events: AgentEvent[];

      beforeEach(async () => {
        const duoEvent = createFakePartial<DuoWorkflowEvent>({
          checkpoint: '',
        });
        events = await service.mapWorkflowEvent(duoEvent, ['once']);
      });

      it('should return empty array', () => {
        expect(events).toEqual([]);
      });
    });

    describe('user messages', () => {
      let events: AgentEvent[];

      beforeEach(async () => {
        events = await mapMessagesWithService([
          {
            message_type: 'user',
            content: 'Hello',
            tool_info: null,
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:00Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowMessage,
        ]);
      });

      it('should skip user messages', () => {
        expect(events).toEqual([]);
      });
    });

    describe('agent messages', () => {
      describe('when message is new', () => {
        let events: AgentEvent[];

        beforeEach(async () => {
          events = await mapMessagesWithService([
            {
              message_type: 'agent',
              content: 'Hello world',
              tool_info: null,
              message_sub_type: null,
              timestamp: '2024-01-01T00:00:00Z',
              status: null,
              correlation_id: null,
              additional_context: null,
            } satisfies WorkflowMessage,
          ]);
        });

        it('should emit full content as TextChunk', () => {
          expect(events).toEqual([
            {
              type: AgentEventType.TextChunk,
              messageId: '0',
              content: 'Hello world',
              timestamp: expect.any(Number),
            },
          ]);
        });

        it('should parse timestamp from ISO string to Unix epoch ms', () => {
          const expectedTimestamp = Date.parse('2024-01-01T00:00:00Z');
          expect(events[0].timestamp).toBe(expectedTimestamp);
        });
      });

      describe('when message is being updated (same ID)', () => {
        const initialAgentMessage: WorkflowMessage = {
          message_type: 'agent',
          content: 'Hello',
          tool_info: null,
          message_sub_type: null,
          timestamp: '2024-01-01T00:00:00Z',
          status: null,
          correlation_id: null,
          additional_context: null,
        };

        beforeEach(async () => {
          await mapMessagesWithService([initialAgentMessage]);
        });

        it('should emit only the delta content', async () => {
          const updatedMessage = {
            ...initialAgentMessage,
            content: 'Hello world',
          };

          const events = await mapMessagesWithService([updatedMessage]);

          expect(events).toEqual([
            {
              type: AgentEventType.TextChunk,
              messageId: '0',
              content: ' world',
              timestamp: expect.any(Number),
            },
          ]);
        });

        describe('when content has not changed', () => {
          it('should emit nothing', async () => {
            const events = await mapMessagesWithService([initialAgentMessage]);

            expect(events).toEqual([]);
          });
        });

        describe('when content is replaced unexpectedly', () => {
          it('should log error', async () => {
            const replacedMessage = {
              ...initialAgentMessage,
              content: 'Goodbye',
            };

            await mapMessagesWithService([replacedMessage]);

            expect(testLogger.errorLogs).toHaveLength(1);
            expect(testLogger.errorLogs[0].message).toContain(
              'replaced message content unexpectedly',
            );
          });

          it('should emit full content', async () => {
            const replacedMessage = {
              ...initialAgentMessage,
              content: 'Goodbye',
            };

            const events = await mapMessagesWithService([replacedMessage]);

            expect(events).toEqual([
              {
                type: AgentEventType.TextChunk,
                messageId: '0',
                content: 'Goodbye',
                timestamp: expect.any(Number),
              },
            ]);
          });
        });
      });

      describe('when multiple agent messages arrive in a single checkpoint', () => {
        let events: AgentEvent[];

        beforeEach(async () => {
          events = await mapMessagesWithService([
            {
              message_type: 'agent',
              content: 'First',
              tool_info: null,
              message_sub_type: null,
              timestamp: '2024-01-01T00:00:00Z',
              status: null,
              correlation_id: null,
              additional_context: null,
            },
            {
              message_type: 'agent',
              content: 'Second',
              tool_info: null,
              message_sub_type: null,
              timestamp: '2024-01-01T00:00:01Z',
              status: null,
              correlation_id: null,
              additional_context: null,
            },
          ] satisfies WorkflowMessage[]);
        });

        it('should process all new messages in the batch', () => {
          expect(events).toEqual([
            {
              type: AgentEventType.TextChunk,
              messageId: '0',
              content: 'First',
              timestamp: expect.any(Number),
            },
            {
              type: AgentEventType.TextChunk,
              messageId: '1',
              content: 'Second',
              timestamp: expect.any(Number),
            },
          ]);
        });
      });

      describe('when a batch checkpoint contains an agent message followed by tool results (ToolsExecutor pattern)', () => {
        it('should emit the agent TextChunk and all tool events', async () => {
          const agentMessage: WorkflowMessage = {
            message_type: 'agent',
            content: 'Running tools now',
            tool_info: null,
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:00Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          };
          const toolMessage: WorkflowTool = {
            message_type: 'tool',
            content: 'tool output',
            tool_info: {
              name: 'bash',
              args: { command: 'ls' },
              tool_response: 'file.txt',
            },
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:01Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          };

          // Both arrive together in one checkpoint — simulates ToolsExecutor
          // emitting agent text + tool result as a single state update.
          const events = await mapMessagesWithService([agentMessage, toolMessage]);

          const textEvents = events.filter((e) => e.type === AgentEventType.TextChunk);
          const toolCompleteEvents = events.filter((e) => e.type === AgentEventType.ToolComplete);

          expect(textEvents).toHaveLength(1);
          expect(textEvents[0]).toMatchObject({
            type: AgentEventType.TextChunk,
            messageId: '0',
            content: 'Running tools now',
          });

          expect(toolCompleteEvents).toHaveLength(1);
          expect(toolCompleteEvents[0]).toMatchObject({
            type: AgentEventType.ToolComplete,
            toolId: '1',
            result: 'file.txt',
          });
        });

        it('should not re-emit already-processed tool events when the next checkpoint only updates the agent in-place', async () => {
          const agentMessage: WorkflowMessage = {
            message_type: 'agent',
            content: 'Running',
            tool_info: null,
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:00Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          };
          const toolMessage: WorkflowTool = {
            message_type: 'tool',
            content: 'tool output',
            tool_info: {
              name: 'bash',
              args: { command: 'ls' },
              tool_response: 'file.txt',
            },
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:01Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          };

          // First checkpoint: agent + tool batch. Count advances to 2.
          await mapMessagesWithService([agentMessage, toolMessage]);

          // Second checkpoint: a new agent message appended after the tool —
          // only the new agent should be emitted, not the already-seen tool.
          const nextAgentMessage: WorkflowMessage = {
            message_type: 'agent',
            content: 'Done',
            tool_info: null,
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:02Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          };
          const events = await mapMessagesWithService([
            agentMessage,
            toolMessage,
            nextAgentMessage,
          ]);

          expect(events).toEqual([
            {
              type: AgentEventType.TextChunk,
              messageId: '2',
              content: 'Done',
              timestamp: expect.any(Number),
            },
          ]);
        });
      });
    });

    describe('request messages (tool approval requests)', () => {
      let events: AgentEvent[];

      beforeEach(async () => {
        events = await mapMessagesWithService([
          {
            message_type: 'request',
            content: 'Tool needs approval',
            tool_info: {
              name: 'bash',
              args: { command: 'ls -la' },
            },
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:00Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowRequest,
        ]);
      });

      it('should emit ToolAwaitingApproval event', () => {
        expect(events).toEqual([
          {
            type: AgentEventType.ToolAwaitingApproval,
            toolId: '0',
            toolName: 'bash',
            input: { tool: 'generic', name: 'test_tool', args: {} },
            content: 'Tool needs approval',
            timestamp: expect.any(Number),
            availableScopes: ['once'],
          },
        ]);
      });

      it('should format tool input', () => {
        expect(mockFormatToolInput).toHaveBeenCalledWith('bash', {
          command: 'ls -la',
        });
      });
    });

    describe('tool messages (tool execution)', () => {
      describe('when matching approval request exists', () => {
        const requestAndToolMessages: [WorkflowRequest, WorkflowTool] = [
          {
            message_type: 'request',
            content: 'Approval request',
            tool_info: {
              name: 'bash',
              args: { command: 'ls' },
            },
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:00Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          },
          {
            message_type: 'tool',
            content: 'Tool output',
            tool_info: {
              name: 'bash',
              args: { command: 'ls' },
              tool_response: {
                content: 'file1.txt\nfile2.txt',
                additional_kwargs: {},
                response_metadata: {},
                type: 'tool',
                name: 'bash',
                id: null,
                tool_call_id: '123',
                artifact: null,
                status: 'success',
              },
            },
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:01Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          },
        ];

        let events: AgentEvent[];

        beforeEach(async () => {
          events = await mapMessagesWithService(requestAndToolMessages);
        });

        it('should emit ToolComplete with matched toolId', () => {
          expect(events).toEqual([
            {
              type: AgentEventType.ToolComplete,
              toolId: '0',
              result: 'file1.txt\nfile2.txt',
              timestamp: expect.any(Number),
            },
          ]);
        });
      });

      describe('when no matching approval request exists', () => {
        describe('with auto-approved tools', () => {
          let events: AgentEvent[];

          beforeEach(async () => {
            events = await mapMessagesWithService([
              {
                message_type: 'tool',
                content: 'Tool output',
                tool_info: {
                  name: 'bash',
                  args: { command: 'ls' },
                  tool_response: 'file1.txt\nfile2.txt',
                },
                message_sub_type: null,
                timestamp: '2024-01-01T00:00:00Z',
                status: null,
                correlation_id: null,
                additional_context: null,
              } satisfies WorkflowTool,
            ]);
          });

          // FIXME: why do we need to emit both events? Shouldn't ToolComplete be enough?
          it('should emit both ToolAwaitingApproval and ToolComplete', () => {
            expect(events).toEqual([
              {
                type: AgentEventType.ToolAwaitingApproval,
                toolId: '0',
                toolName: 'bash',
                input: { tool: 'generic', name: 'test_tool', args: {} },
                content: 'Tool output',
                timestamp: expect.any(Number),
                availableScopes: ['once'],
              },
              {
                type: AgentEventType.ToolComplete,
                toolId: '0',
                result: 'file1.txt\nfile2.txt',
                timestamp: expect.any(Number),
              },
            ]);
          });
        });

        describe('when tool_info is null', () => {
          let events: AgentEvent[];

          beforeEach(async () => {
            events = await mapMessagesWithService([
              {
                message_type: 'tool',
                content: 'Tool output',
                tool_info: null,
                message_sub_type: null,
                timestamp: '2024-01-01T00:00:00Z',
                status: null,
                correlation_id: null,
                additional_context: null,
              } satisfies WorkflowTool,
            ]);
          });

          it('should handle null tool_info', () => {
            expect(events).toEqual([
              {
                type: AgentEventType.ToolAwaitingApproval,
                toolId: '0',
                toolName: 'unknown tool',
                input: { tool: 'generic', name: 'test_tool', args: {} },
                content: 'Tool output',
                timestamp: expect.any(Number),
                availableScopes: ['once'],
              },
              {
                type: AgentEventType.ToolComplete,
                toolId: '0',
                result: 'Tool output',
                timestamp: expect.any(Number),
              },
            ]);
          });
        });
      });

      describe('when tool response is a string', () => {
        let events: AgentEvent[];

        beforeEach(async () => {
          events = await mapMessagesWithService([
            {
              message_type: 'tool',
              content: 'Tool output',
              tool_info: {
                name: 'bash',
                args: { command: 'ls' },
                tool_response: 'Direct string response',
              },
              message_sub_type: null,
              timestamp: '2024-01-01T00:00:00Z',
              status: null,
              correlation_id: null,
              additional_context: null,
            } satisfies WorkflowTool,
          ]);
        });

        it('should use string response as result', () => {
          expect(events[1]).toEqual({
            type: AgentEventType.ToolComplete,
            toolId: '0',
            result: 'Direct string response',
            timestamp: expect.any(Number),
          });
        });
      });

      describe('when tool response starts with "Action error:"', () => {
        let events: AgentEvent[];

        beforeEach(async () => {
          events = await mapMessagesWithService([
            {
              message_type: 'tool',
              content: 'Action error: Command not found',
              tool_info: {
                name: 'bash',
                args: { command: 'invalid' },
                tool_response: {
                  content: 'Action error: Command not found',
                  additional_kwargs: {},
                  response_metadata: {},
                  type: 'tool',
                  name: 'bash',
                  id: null,
                  tool_call_id: '123',
                  artifact: null,
                  status: 'success',
                },
              },
              message_sub_type: null,
              timestamp: '2024-01-01T00:00:00Z',
              status: null,
              correlation_id: null,
              additional_context: null,
            } satisfies WorkflowTool,
          ]);
        });

        it('should emit ToolComplete with error', () => {
          expect(events[1]).toEqual({
            type: AgentEventType.ToolComplete,
            toolId: '0',
            result: '',
            error: 'Action error: Command not found',
            timestamp: expect.any(Number),
          });
        });
      });

      describe('args matching', () => {
        describe.each([
          {
            description: 'command-based tools',
            requestArgs: { program: 'npm', args: ['install'] },
            toolArgs: { program: 'npm', otherField: 'different' },
            shouldMatch: true,
          },
          {
            description: 'command-based tools with different programs',
            requestArgs: { program: 'npm', args: ['install'] },
            toolArgs: { program: 'yarn', args: ['install'] },
            shouldMatch: false,
          },
          {
            description: 'non-command tools with identical args',
            requestArgs: { foo: 'bar', baz: 123 },
            toolArgs: { foo: 'bar', baz: 123 },
            shouldMatch: true,
          },
          {
            description: 'non-command tools with different args',
            requestArgs: { foo: 'bar' },
            toolArgs: { foo: 'baz' },
            shouldMatch: false,
          },
        ])('$description', ({ requestArgs, toolArgs, shouldMatch }) => {
          it(`should ${shouldMatch ? 'match' : 'not match'} request and tool`, async () => {
            const messages: [WorkflowRequest, WorkflowTool] = [
              {
                message_type: 'request',
                content: 'Approval request',
                tool_info: {
                  name: 'tool',
                  args: requestArgs,
                },
                message_sub_type: null,
                timestamp: '2024-01-01T00:00:00Z',
                status: null,
                correlation_id: null,
                additional_context: null,
              },
              {
                message_type: 'tool',
                content: 'Tool output',
                tool_info: {
                  name: 'tool',
                  args: toolArgs,
                  tool_response: 'result',
                },
                message_sub_type: null,
                timestamp: '2024-01-01T00:00:01Z',
                status: null,
                correlation_id: null,
                additional_context: null,
              },
            ];

            const events = await mapMessagesWithService(messages);

            const toolCompleteEvent = events.find(
              (e): e is Extract<AgentEvent, { type: AgentEventType.ToolComplete }> =>
                e.type === AgentEventType.ToolComplete,
            );

            expect(toolCompleteEvent?.toolId).toBe(shouldMatch ? '0' : '1');
          });
        });
      });
    });
  });

  describe('compaction notice suppression', () => {
    const compactionCard: WorkflowTool = {
      message_type: 'tool',
      content: 'Nothing to compact',
      tool_info: { name: 'compaction', args: { trigger: 'manual', messages_summarized: 0 } },
      message_sub_type: null,
      timestamp: '2024-01-01T00:00:00Z',
      status: null,
      correlation_id: null,
      additional_context: null,
    };

    const compactionNotice: WorkflowMessage = {
      message_type: 'agent',
      content: 'There is no conversation history to compact yet.',
      tool_info: null,
      message_sub_type: null,
      timestamp: '2024-01-01T00:00:01Z',
      status: null,
      correlation_id: null,
      additional_context: null,
    };

    it('suppresses the agent notice that follows a compaction card (live)', async () => {
      const events = await mapMessagesWithService([compactionCard, compactionNotice]);

      expect(events.filter((e) => e.type === AgentEventType.TextChunk)).toHaveLength(0);
    });

    it('suppresses the agent notice that follows a compaction card (replay)', async () => {
      const events = await service.mapChatLogToSessionEvents([compactionCard, compactionNotice]);

      expect(events.filter((e) => e.type === AgentEventType.TextChunk)).toHaveLength(0);
    });

    it('does not suppress an agent message that follows a non-compaction tool', async () => {
      const regularTool: WorkflowTool = {
        ...compactionCard,
        tool_info: { name: 'bash', args: { command: 'ls' }, tool_response: 'file.txt' },
        message_sub_type: null,
      };
      const events = await mapMessagesWithService([
        regularTool,
        { ...compactionNotice, content: 'All done.' },
      ]);

      const textEvents = events.filter((e) => e.type === AgentEventType.TextChunk);
      expect(textEvents).toHaveLength(1);
      expect(textEvents[0]).toMatchObject({ content: 'All done.' });
    });
  });

  describe('mapChatLogToSessionEvents', () => {
    describe('when chat log is empty', () => {
      let events: SessionEvent[];

      beforeEach(async () => {
        events = await service.mapChatLogToSessionEvents([]);
      });

      it('should return empty array', () => {
        expect(events).toEqual([]);
      });
    });

    describe('when chat log contains a user message', () => {
      let events: SessionEvent[];

      beforeEach(async () => {
        events = await service.mapChatLogToSessionEvents([
          {
            message_type: 'user',
            content: 'Hello from user',
            tool_info: null,
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:00Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowMessage,
        ]);
      });

      it('should emit UserMessage event', () => {
        expect(events).toEqual([
          {
            type: UserEventType.UserMessage,
            messageId: '0',
            content: 'Hello from user',
            timestamp: Date.parse('2024-01-01T00:00:00Z'),
          },
        ]);
      });
    });

    describe('when chat log contains an agent message', () => {
      let events: SessionEvent[];

      beforeEach(async () => {
        events = await service.mapChatLogToSessionEvents([
          {
            message_type: 'agent',
            content: 'Hello from agent',
            tool_info: null,
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:00Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowMessage,
        ]);
      });

      it('should emit TextChunk event with full content', () => {
        expect(events).toEqual([
          {
            type: AgentEventType.TextChunk,
            messageId: '0',
            content: 'Hello from agent',
            timestamp: Date.parse('2024-01-01T00:00:00Z'),
          },
        ]);
      });
    });

    describe('when chat log contains a request with a matching tool execution', () => {
      let events: SessionEvent[];

      beforeEach(async () => {
        events = await service.mapChatLogToSessionEvents([
          {
            message_type: 'request',
            content: 'Needs approval',
            tool_info: {
              name: 'bash',
              args: { command: 'ls -la' },
            },
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:00Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowRequest,
          {
            message_type: 'tool',
            content: 'Tool ran',
            tool_info: {
              name: 'bash',
              args: { command: 'ls -la' },
              tool_response: {
                content: 'file1.txt\nfile2.txt',
                additional_kwargs: {},
                response_metadata: {},
                type: 'tool',
                name: 'bash',
                id: null,
                tool_call_id: '123',
                artifact: null,
                status: 'success',
              },
            },
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:01Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowTool,
        ]);
      });

      it('should emit ToolAwaitingApproval and ToolComplete', () => {
        expect(events).toEqual([
          {
            type: AgentEventType.ToolAwaitingApproval,
            toolId: '0',
            toolName: 'bash',
            input: { tool: 'generic', name: 'test_tool', args: {} },
            content: 'Needs approval',
            timestamp: Date.parse('2024-01-01T00:00:00Z'),
            availableScopes: ['once'],
          },
          {
            type: AgentEventType.ToolComplete,
            toolId: '0',
            result: 'file1.txt\nfile2.txt',
            timestamp: Date.parse('2024-01-01T00:00:01Z'),
          },
        ]);
      });
    });

    describe('when chat log ends with a request without a matching tool execution', () => {
      let events: SessionEvent[];

      beforeEach(async () => {
        events = await service.mapChatLogToSessionEvents([
          {
            message_type: 'request',
            content: 'Needs approval',
            tool_info: {
              name: 'bash',
              args: { command: 'ls -la /' },
            },
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:00Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowRequest,
        ]);
      });

      it('should emit only ToolAwaitingApproval so the prompt can be re-presented on resume', () => {
        expect(events).toEqual([
          {
            type: AgentEventType.ToolAwaitingApproval,
            toolId: '0',
            toolName: 'bash',
            input: { tool: 'generic', name: 'test_tool', args: {} },
            content: 'Needs approval',
            timestamp: Date.parse('2024-01-01T00:00:00Z'),
            availableScopes: ['once'],
          },
        ]);
      });
    });

    describe('when chat log contains a non-trailing request without a matching tool execution', () => {
      let events: SessionEvent[];

      beforeEach(async () => {
        // An earlier request without a matching tool execution is treated as
        // resolved (e.g. rejected) since the conversation continued past it.
        events = await service.mapChatLogToSessionEvents([
          {
            message_type: 'request',
            content: 'Needs approval',
            tool_info: {
              name: 'bash',
              args: { command: 'ls -la /' },
            },
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:00Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowRequest,
          {
            message_type: 'agent',
            content: 'Continuing without that tool',
            tool_info: null,
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:01Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowMessage,
        ]);
      });

      it('should emit ToolAwaitingApproval and a synthetic ToolComplete', () => {
        expect(events).toEqual([
          {
            type: AgentEventType.ToolAwaitingApproval,
            toolId: '0',
            toolName: 'bash',
            input: { tool: 'generic', name: 'test_tool', args: {} },
            content: 'Needs approval',
            timestamp: Date.parse('2024-01-01T00:00:00Z'),
            availableScopes: ['once'],
          },
          {
            type: AgentEventType.ToolComplete,
            toolId: '0',
            result: '',
            timestamp: Date.parse('2024-01-01T00:00:00Z'),
          },
          {
            type: AgentEventType.TextChunk,
            messageId: '1',
            content: 'Continuing without that tool',
            timestamp: Date.parse('2024-01-01T00:00:01Z'),
          },
        ]);
      });
    });

    describe('when chat log contains an orphan tool (no matching request)', () => {
      let events: SessionEvent[];

      beforeEach(async () => {
        events = await service.mapChatLogToSessionEvents([
          {
            message_type: 'tool',
            content: 'Auto-approved tool output',
            tool_info: {
              name: 'bash',
              args: { command: 'echo hello' },
              tool_response: 'hello',
            },
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:00Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowTool,
        ]);
      });

      it('should emit ToolAwaitingApproval and ToolComplete', () => {
        expect(events).toEqual([
          {
            type: AgentEventType.ToolAwaitingApproval,
            toolId: '0',
            toolName: 'bash',
            input: { tool: 'generic', name: 'test_tool', args: {} },
            content: 'Auto-approved tool output',
            timestamp: expect.any(Number),
            availableScopes: ['once'],
          },
          {
            type: AgentEventType.ToolComplete,
            toolId: '0',
            result: 'hello',
            timestamp: expect.any(Number),
          },
        ]);
      });
    });

    describe('when chat log contains a tool with a matching request', () => {
      let events: SessionEvent[];

      beforeEach(async () => {
        events = await service.mapChatLogToSessionEvents([
          {
            message_type: 'request',
            content: 'Approval request',
            tool_info: {
              name: 'bash',
              args: { command: 'ls' },
            },
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:00Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowRequest,
          {
            message_type: 'tool',
            content: 'Tool output',
            tool_info: {
              name: 'bash',
              args: { command: 'ls' },
              tool_response: 'file1.txt',
            },
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:01Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowTool,
        ]);
      });

      it('should skip the tool entry (already handled by the request case)', () => {
        const toolAwaitingEvents = events.filter(
          (e) => e.type === AgentEventType.ToolAwaitingApproval,
        );
        const toolCompleteEvents = events.filter((e) => e.type === AgentEventType.ToolComplete);

        expect(toolAwaitingEvents).toHaveLength(1);
        expect(toolCompleteEvents).toHaveLength(1);
        expect(toolAwaitingEvents[0].toolId).toBe('0');
        expect(toolCompleteEvents[0].toolId).toBe('0');
      });
    });

    describe('when tool has null tool_info (orphan)', () => {
      let events: SessionEvent[];

      beforeEach(async () => {
        events = await service.mapChatLogToSessionEvents([
          {
            message_type: 'tool',
            content: 'Some tool output',
            tool_info: null,
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:00Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowTool,
        ]);
      });

      it('should use "unknown tool" as the tool name', () => {
        expect(events[0]).toEqual(
          expect.objectContaining({
            type: AgentEventType.ToolAwaitingApproval,
            toolName: 'unknown tool',
          }),
        );
      });

      it('should format tool input with "unknown tool" name and empty args', () => {
        expect(mockFormatToolInput).toHaveBeenCalledWith('unknown tool', {});
      });
    });

    describe('when tool_response is a string', () => {
      let events: SessionEvent[];

      beforeEach(async () => {
        events = await service.mapChatLogToSessionEvents([
          {
            message_type: 'tool',
            content: 'Fallback content',
            tool_info: {
              name: 'bash',
              args: { command: 'echo hi' },
              tool_response: 'Direct string response',
            },
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:00Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowTool,
        ]);
      });

      it('should use string tool_response directly as output', () => {
        const completeEvent = events.find((e) => e.type === AgentEventType.ToolComplete);
        expect(completeEvent).toEqual(
          expect.objectContaining({
            result: 'Direct string response',
          }),
        );
      });
    });

    describe('when tool_response is an object', () => {
      let events: SessionEvent[];

      beforeEach(async () => {
        events = await service.mapChatLogToSessionEvents([
          {
            message_type: 'tool',
            content: 'Fallback content',
            tool_info: {
              name: 'bash',
              args: { command: 'ls' },
              tool_response: {
                content: 'Object content response',
                additional_kwargs: {},
                response_metadata: {},
                type: 'tool',
                name: 'bash',
                id: null,
                tool_call_id: '456',
                artifact: null,
                status: 'success',
              },
            },
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:00Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowTool,
        ]);
      });

      it('should use .content from the tool_response object', () => {
        const completeEvent = events.find((e) => e.type === AgentEventType.ToolComplete);
        expect(completeEvent).toEqual(
          expect.objectContaining({
            result: 'Object content response',
          }),
        );
      });
    });

    describe('when tool output starts with "Action error:"', () => {
      let events: SessionEvent[];

      beforeEach(async () => {
        events = await service.mapChatLogToSessionEvents([
          {
            message_type: 'tool',
            content: 'Action error: Command not found',
            tool_info: {
              name: 'bash',
              args: { command: 'invalid' },
              tool_response: 'Action error: Command not found',
            },
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:00Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowTool,
        ]);
      });

      it('should emit ToolComplete with error field and empty result', () => {
        const completeEvent = events.find((e) => e.type === AgentEventType.ToolComplete);
        expect(completeEvent).toEqual(
          expect.objectContaining({
            type: AgentEventType.ToolComplete,
            result: '',
            error: 'Action error: Command not found',
          }),
        );
      });
    });

    describe('when timestamp is invalid', () => {
      let events: SessionEvent[];
      let nowSpy: jest.SpiedFunction<() => number>;

      beforeEach(async () => {
        nowSpy = jest.spyOn(Date, 'now').mockReturnValue(9999999);
        events = await service.mapChatLogToSessionEvents([
          {
            message_type: 'user',
            content: 'Hello',
            tool_info: null,
            message_sub_type: null,
            timestamp: 'not-a-valid-timestamp',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowMessage,
        ]);
      });

      afterEach(() => {
        nowSpy.mockRestore();
      });

      it('should fall back to Date.now()', () => {
        expect(events[0].timestamp).toBe(9999999);
      });
    });

    describe('args matching in session restore', () => {
      describe('when two sequential bash requests have different args', () => {
        let events: SessionEvent[];

        beforeEach(async () => {
          events = await service.mapChatLogToSessionEvents([
            {
              message_type: 'request',
              content: 'Run ls',
              tool_info: {
                name: 'bash',
                args: { command: 'ls' },
              },
              message_sub_type: null,
              timestamp: '2024-01-01T00:00:00Z',
              status: null,
              correlation_id: null,
              additional_context: null,
            } satisfies WorkflowRequest,
            {
              message_type: 'request',
              content: 'Run cat',
              tool_info: {
                name: 'bash',
                args: { command: 'cat foo.txt' },
              },
              message_sub_type: null,
              timestamp: '2024-01-01T00:00:01Z',
              status: null,
              correlation_id: null,
              additional_context: null,
            } satisfies WorkflowRequest,
            {
              message_type: 'tool',
              content: 'cat output',
              tool_info: {
                name: 'bash',
                args: { command: 'cat foo.txt' },
                tool_response: 'file contents',
              },
              message_sub_type: null,
              timestamp: '2024-01-01T00:00:02Z',
              status: null,
              correlation_id: null,
              additional_context: null,
            } satisfies WorkflowTool,
            {
              message_type: 'tool',
              content: 'ls output',
              tool_info: {
                name: 'bash',
                args: { command: 'ls' },
                tool_response: 'dir_listing',
              },
              message_sub_type: null,
              timestamp: '2024-01-01T00:00:03Z',
              status: null,
              correlation_id: null,
              additional_context: null,
            } satisfies WorkflowTool,
          ]);
        });

        it('should match each request to the tool with the same args', () => {
          expect(events).toEqual([
            {
              type: AgentEventType.ToolAwaitingApproval,
              toolId: '0',
              toolName: 'bash',
              input: { tool: 'generic', name: 'test_tool', args: {} },
              content: 'Run ls',
              timestamp: Date.parse('2024-01-01T00:00:00Z'),
              availableScopes: ['once'],
            },
            {
              type: AgentEventType.ToolComplete,
              toolId: '0',
              result: 'dir_listing',
              timestamp: Date.parse('2024-01-01T00:00:03Z'),
            },
            {
              type: AgentEventType.ToolAwaitingApproval,
              toolId: '1',
              toolName: 'bash',
              input: { tool: 'generic', name: 'test_tool', args: {} },
              content: 'Run cat',
              timestamp: Date.parse('2024-01-01T00:00:01Z'),
              availableScopes: ['once'],
            },
            {
              type: AgentEventType.ToolComplete,
              toolId: '1',
              result: 'file contents',
              timestamp: Date.parse('2024-01-01T00:00:02Z'),
            },
          ]);
        });

        it('should produce 4 events total (tools are skipped because they have matching requests)', () => {
          expect(events).toHaveLength(4);
        });
      });

      describe('when a tool has a matching request but another tool does not', () => {
        let events: SessionEvent[];

        beforeEach(async () => {
          events = await service.mapChatLogToSessionEvents([
            {
              message_type: 'request',
              content: 'Run ls',
              tool_info: {
                name: 'bash',
                args: { command: 'ls' },
              },
              message_sub_type: null,
              timestamp: '2024-01-01T00:00:00Z',
              status: null,
              correlation_id: null,
              additional_context: null,
            } satisfies WorkflowRequest,
            {
              message_type: 'tool',
              content: 'ls output',
              tool_info: {
                name: 'bash',
                args: { command: 'ls' },
                tool_response: 'dir_listing',
              },
              message_sub_type: null,
              timestamp: '2024-01-01T00:00:01Z',
              status: null,
              correlation_id: null,
              additional_context: null,
            } satisfies WorkflowTool,
            {
              message_type: 'tool',
              content: 'cat output',
              tool_info: {
                name: 'bash',
                args: { command: 'cat foo.txt' },
                tool_response: 'file contents',
              },
              message_sub_type: null,
              timestamp: '2024-01-01T00:00:02Z',
              status: null,
              correlation_id: null,
              additional_context: null,
            } satisfies WorkflowTool,
          ]);
        });

        it('should skip the tool with a matching request and treat the other as an orphan', () => {
          expect(events).toEqual([
            {
              type: AgentEventType.ToolAwaitingApproval,
              toolId: '0',
              toolName: 'bash',
              input: { tool: 'generic', name: 'test_tool', args: {} },
              content: 'Run ls',
              timestamp: Date.parse('2024-01-01T00:00:00Z'),
              availableScopes: ['once'],
            },
            {
              type: AgentEventType.ToolComplete,
              toolId: '0',
              result: 'dir_listing',
              timestamp: Date.parse('2024-01-01T00:00:01Z'),
            },
            {
              type: AgentEventType.ToolAwaitingApproval,
              toolId: '2',
              toolName: 'bash',
              input: { tool: 'generic', name: 'test_tool', args: {} },
              content: 'cat output',
              timestamp: Date.parse('2024-01-01T00:00:02Z'),
              availableScopes: ['once'],
            },
            {
              type: AgentEventType.ToolComplete,
              toolId: '2',
              result: 'file contents',
              timestamp: Date.parse('2024-01-01T00:00:02Z'),
            },
          ]);
        });

        it('should produce 4 events total', () => {
          expect(events).toHaveLength(4);
        });
      });
    });

    describe('when chat log contains a mixed conversation', () => {
      let events: SessionEvent[];

      beforeEach(async () => {
        events = await service.mapChatLogToSessionEvents([
          {
            message_type: 'user',
            content: 'Do something',
            tool_info: null,
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:00Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowMessage,
          {
            message_type: 'agent',
            content: 'Sure, let me run a command',
            tool_info: null,
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:01Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowMessage,
          {
            message_type: 'request',
            content: 'Approval needed',
            tool_info: {
              name: 'bash',
              args: { command: 'ls' },
            },
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:02Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowRequest,
          {
            message_type: 'tool',
            content: 'Tool ran',
            tool_info: {
              name: 'bash',
              args: { command: 'ls' },
              tool_response: 'output.txt',
            },
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:03Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowTool,
          {
            message_type: 'user',
            content: 'Thanks',
            tool_info: null,
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:04Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowMessage,
          {
            message_type: 'agent',
            content: 'You are welcome',
            tool_info: null,
            message_sub_type: null,
            timestamp: '2024-01-01T00:00:05Z',
            status: null,
            correlation_id: null,
            additional_context: null,
          } satisfies WorkflowMessage,
        ]);
      });

      it('should produce the correct number of events', () => {
        expect(events).toHaveLength(6);
      });

      it('should produce events in the correct order', () => {
        expect(events.map((e) => e.type)).toEqual([
          UserEventType.UserMessage,
          AgentEventType.TextChunk,
          AgentEventType.ToolAwaitingApproval,
          AgentEventType.ToolComplete,
          UserEventType.UserMessage,
          AgentEventType.TextChunk,
        ]);
      });
    });
  });

  // These tests run real ui_chat_log snapshots captured from live Duo CLI
  // sessions (standard flow and `--developer` flow) through the same pipeline
  // the backend uses: extractUiChatLog -> WorkflowEventMapperService. They guard
  // against regressions when the backend changes the checkpoint shape.
  // See packages/lib_workflow_api/src/test_fixtures.ts for how they were captured.
  describe('with real Duo CLI checkpoint fixtures', () => {
    function chatLogFor(uiChatLog: unknown[]): ChatLog[] {
      const result = extractUiChatLog({
        checkpoint: buildCheckpointFromUiChatLog(uiChatLog),
      } as unknown as DuoWorkflowEvent);
      if (result.isErr()) throw result.error;
      return result.value;
    }

    function idOf(event: SessionEvent): string {
      if ('toolId' in event) return event.toolId;
      if ('messageId' in event) return event.messageId;
      return '';
    }

    describe('standard flow (no --developer flag)', () => {
      describe('mapWorkflowEvent on the final checkpoint', () => {
        let events: AgentEvent[];

        beforeEach(async () => {
          const duoEvent = createFakePartial<DuoWorkflowEvent>({
            checkpoint: buildCheckpointFromUiChatLog(standardFlowUiChatLog),
          });
          events = await service.mapWorkflowEvent(duoEvent, ['once']);
        });

        it('auto-approves in-batch tool calls and emits ToolComplete + final TextChunk', () => {
          expect(events.map((e) => [e.type, idOf(e)])).toEqual([
            [AgentEventType.ToolComplete, '1'],
            [AgentEventType.ToolComplete, '3'],
            [AgentEventType.ToolComplete, '4'],
            [AgentEventType.TextChunk, '7'],
          ]);
        });

        it('uses the object tool_response content as the ToolComplete result', () => {
          const first = events[0];
          expect(first.type).toBe(AgentEventType.ToolComplete);
          expect('result' in first && first.result).toContain('total 2720');
        });
      });

      describe('mapChatLogToSessionEvents (session replay)', () => {
        let events: SessionEvent[];

        beforeEach(async () => {
          events = await service.mapChatLogToSessionEvents(chatLogFor(standardFlowUiChatLog));
        });

        it('replays the conversation as user/tool/agent events', () => {
          expect(events.map((e) => [e.type, idOf(e)])).toEqual([
            [UserEventType.UserMessage, '0'],
            [AgentEventType.ToolAwaitingApproval, '1'],
            [AgentEventType.ToolComplete, '1'],
            [AgentEventType.ToolAwaitingApproval, '3'],
            [AgentEventType.ToolComplete, '3'],
            [AgentEventType.ToolAwaitingApproval, '4'],
            [AgentEventType.ToolComplete, '4'],
            [AgentEventType.TextChunk, '7'],
          ]);
        });

        it('matches each run_command approval with its result', () => {
          const approvals = events.filter((e) => e.type === AgentEventType.ToolAwaitingApproval);
          expect(approvals).toHaveLength(3);
          expect(approvals.every((e) => e.toolName === 'run_command')).toBe(true);
        });
      });
    });

    describe('developer flow (--developer flag)', () => {
      describe('mapWorkflowEvent on the final checkpoint', () => {
        let events: AgentEvent[];

        beforeEach(async () => {
          const duoEvent = createFakePartial<DuoWorkflowEvent>({
            checkpoint: buildCheckpointFromUiChatLog(developerFlowUiChatLog),
          });
          events = await service.mapWorkflowEvent(duoEvent, ['once']);
        });

        it('interleaves reasoning TextChunks with auto-approved tool calls', () => {
          expect(events.map((e) => [e.type, idOf(e)])).toEqual([
            [AgentEventType.TextChunk, '1'],
            [AgentEventType.ToolComplete, '2'],
            [AgentEventType.ToolAwaitingApproval, '4'],
            [AgentEventType.ToolComplete, '4'],
            [AgentEventType.TextChunk, '5'],
            [AgentEventType.ToolAwaitingApproval, '6'],
            [AgentEventType.ToolComplete, '6'],
            [AgentEventType.TextChunk, '7'],
          ]);
        });
      });

      describe('mapChatLogToSessionEvents (session replay)', () => {
        let events: SessionEvent[];

        beforeEach(async () => {
          events = await service.mapChatLogToSessionEvents(chatLogFor(developerFlowUiChatLog));
        });

        it('replays reasoning, tool calls and the final answer', () => {
          expect(events.map((e) => [e.type, idOf(e)])).toEqual([
            [UserEventType.UserMessage, '0'],
            [AgentEventType.TextChunk, '1'],
            [AgentEventType.ToolAwaitingApproval, '2'],
            [AgentEventType.ToolComplete, '2'],
            [AgentEventType.ToolAwaitingApproval, '4'],
            [AgentEventType.ToolComplete, '4'],
            [AgentEventType.TextChunk, '5'],
            [AgentEventType.ToolAwaitingApproval, '6'],
            [AgentEventType.ToolComplete, '6'],
            [AgentEventType.TextChunk, '7'],
          ]);
        });

        it('uses the string tool_response directly for the read_file tool', () => {
          const readFileComplete = events.find(
            (e) => e.type === AgentEventType.ToolComplete && e.toolId === '4',
          );
          expect(
            readFileComplete && 'result' in readFileComplete && readFileComplete.result,
          ).toContain('@gitlab-org/gitlab-lsp');
        });

        it('exposes the different tool names used by the developer flow', () => {
          const toolNames = events
            .filter((e) => e.type === AgentEventType.ToolAwaitingApproval)
            .map((e) => e.toolName);
          expect(toolNames).toEqual(['run_command', 'read_file', 'list_dir']);
        });
      });
    });
  });

  describe('context usage (agentContextUsage)', () => {
    function mapWithUsage(
      agentContextUsage: DuoWorkflowEvent['agentContextUsage'],
    ): Promise<AgentEvent[]> {
      const duoEvent = createFakePartial<DuoWorkflowEvent>({
        checkpoint: createCheckpoint([]),
        agentContextUsage,
      });
      return service.mapWorkflowEvent(duoEvent, ['once']);
    }

    function tokenUsageEvents(events: AgentEvent[]) {
      return events.filter((e) => e.type === AgentEventType.TokenUsage);
    }

    it('emits no token usage event when the map is undefined', async () => {
      const events = await mapWithUsage(undefined);
      expect(tokenUsageEvents(events)).toHaveLength(0);
    });

    it('emits no token usage event when the map is empty', async () => {
      const events = await mapWithUsage({});
      expect(tokenUsageEvents(events)).toHaveLength(0);
    });

    it('prefers the entry keyed "agent" over other entries', async () => {
      const events = await mapWithUsage({
        other: { totalTokens: 10, maxTokens: 100 },
        agent: { totalTokens: 73, maxTokens: 100 },
      });

      expect(tokenUsageEvents(events)).toEqual([
        expect.objectContaining({
          type: AgentEventType.TokenUsage,
          totalTokens: 73,
          maxTokens: 100,
        }),
      ]);
    });

    it('uses the sole entry when there is exactly one and no "agent" key', async () => {
      const events = await mapWithUsage({
        planner: { totalTokens: 42, maxTokens: 200 },
      });

      expect(tokenUsageEvents(events)).toEqual([
        expect.objectContaining({
          type: AgentEventType.TokenUsage,
          totalTokens: 42,
          maxTokens: 200,
        }),
      ]);
    });

    it('skips when there are multiple entries and none is keyed "agent"', async () => {
      const events = await mapWithUsage({
        planner: { totalTokens: 42, maxTokens: 200 },
        executor: { totalTokens: 84, maxTokens: 200 },
      });

      expect(tokenUsageEvents(events)).toHaveLength(0);
    });

    it('skips when maxTokens is non-positive (no divide-by-zero downstream)', async () => {
      const zero = await mapWithUsage({ agent: { totalTokens: 50, maxTokens: 0 } });
      expect(tokenUsageEvents(zero)).toHaveLength(0);

      const negative = await mapWithUsage({ agent: { totalTokens: 50, maxTokens: -1 } });
      expect(tokenUsageEvents(negative)).toHaveLength(0);
    });

    it('skips when totalTokens is non-positive', async () => {
      const zero = await mapWithUsage({ agent: { totalTokens: 0, maxTokens: 100 } });
      expect(tokenUsageEvents(zero)).toHaveLength(0);

      const negative = await mapWithUsage({ agent: { totalTokens: -1, maxTokens: 100 } });
      expect(tokenUsageEvents(negative)).toHaveLength(0);
    });

    it('skips when values are non-finite', async () => {
      const events = await mapWithUsage({
        agent: { totalTokens: Number.NaN, maxTokens: 100 },
      });
      expect(tokenUsageEvents(events)).toHaveLength(0);
    });
  });
});

describe('WorkflowEventMapperService with real formatters — malformed edit_file args', () => {
  function createServiceWithRealEditFileFormatter(): WorkflowEventMapperService {
    const fileAccessService = createFakePartial<FileAccessService>({
      getText: jest.fn<() => Promise<string>>().mockRejectedValue(new Error('not found')),
    });
    const editFileFormatter = new EditFileFormatter(new TestLogger(), [fileAccessService]);
    const cliInput = createFakePartial<ParsedCliInput>({ cwd: '/workspace' });
    const formatterService = new ToolInputFormatterService(
      cliInput,
      [editFileFormatter],
      new TestLogger(),
    );
    return new WorkflowEventMapperService(formatterService, new TestLogger());
  }

  function mapEditFileRequest(args: Record<string, unknown>): Promise<AgentEvent[]> {
    const service = createServiceWithRealEditFileFormatter();
    const duoEvent = createFakePartial<DuoWorkflowEvent>({
      checkpoint: JSON.stringify({
        channel_values: {
          ui_chat_log: [
            {
              message_type: 'request',
              content: 'Tool needs approval',
              tool_info: { name: 'edit_file', args },
              message_sub_type: null,
              timestamp: '2024-01-01T00:00:00Z',
              status: null,
              correlation_id: null,
              additional_context: null,
            } satisfies WorkflowRequest,
          ],
        },
      }),
    });
    return service.mapWorkflowEvent(duoEvent, ['once']);
  }

  it('does not crash when file_path is absent from the args (partial/incomplete streamed call)', async () => {
    const events = await mapEditFileRequest({ old_str: 'a', new_str: 'b' });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: AgentEventType.ToolAwaitingApproval,
      toolName: 'edit_file',
    });
  });

  it('does not crash when the path arrives under a different key (ui_chat_log vs gRPC key drift)', async () => {
    const events = await mapEditFileRequest({
      filepath: 'src/foo.ts',
      old_str: 'a',
      new_str: 'b',
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: AgentEventType.ToolAwaitingApproval,
      toolName: 'edit_file',
    });
  });
});
