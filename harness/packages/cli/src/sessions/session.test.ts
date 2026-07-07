import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { asyncGeneratorFromArray, createFakePartial } from '@gitlab-org/test-utils';
import type { ChatElement, ToolInput } from '@gitlab-org/tui';
import { type Logger, TestLogger } from '@gitlab-org/logging';
import {
  AgentEventType,
  CliBackend,
  RetryAgentEvent,
  UserAction,
  UserActionType,
  UserEventType,
} from '../backend/backend';
import { ChatSession } from './session';

describe('ChatSession', () => {
  let mockLogger: Logger;
  let mockBackend: CliBackend;
  let session: ChatSession;

  const mockAction: UserAction = {
    type: UserActionType.SendPrompt,
    prompt: 'Hello',
  };

  async function collectElements(
    targetSession: ChatSession,
    action: UserAction = mockAction,
  ): Promise<ChatElement[]> {
    const elements: ChatElement[] = [];
    for await (const element of targetSession.sendMessageStream(action)) {
      if (element.type !== AgentEventType.Retry) {
        elements.push(element);
      }
    }
    return elements;
  }

  async function collectYielded(
    targetSession: ChatSession,
    action: UserAction = mockAction,
  ): Promise<(ChatElement | RetryAgentEvent)[]> {
    const yielded: (ChatElement | RetryAgentEvent)[] = [];
    for await (const element of targetSession.sendMessageStream(action)) {
      yielded.push(element);
    }
    return yielded;
  }

  beforeEach(() => {
    mockLogger = new TestLogger();

    mockBackend = createFakePartial<CliBackend>({
      id: 'anthropic',
      sendMessageStream: jest
        .fn<CliBackend['sendMessageStream']>()
        .mockReturnValue(asyncGeneratorFromArray([])),
    });

    session = new ChatSession('test-session', mockBackend, mockLogger);
  });

  it('exposes the session id', () => {
    session = new ChatSession('my-session-id', mockBackend, mockLogger);

    expect(session.sessionId).toBe('my-session-id');
  });

  it("reflects the backend's current session id when it changes mid-conversation", () => {
    const backendWithLiveId = createFakePartial<CliBackend>({
      getSessionId: jest.fn<NonNullable<CliBackend['getSessionId']>>().mockReturnValue('fresh-id'),
    });
    session = new ChatSession('dead-id', backendWithLiveId, mockLogger);

    expect(session.sessionId).toBe('fresh-id');
  });

  describe('elements', () => {
    describe('when session is new', () => {
      it('returns an empty array', () => {
        expect(session.elements).toEqual([]);
      });
    });

    describe('after streaming messages', () => {
      beforeEach(async () => {
        jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
          asyncGeneratorFromArray([
            {
              type: AgentEventType.TextChunk,
              messageId: 'msg-1',
              content: 'Hello',
              timestamp: 1000,
            },
          ]),
        );
        await collectElements(session);
      });

      it('contains the accumulated elements', () => {
        expect(session.elements).toHaveLength(1);
        expect(session.elements[0]).toEqual(
          expect.objectContaining({
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            content: 'Hello',
          }),
        );
      });
    });

    describe('after multiple streams', () => {
      beforeEach(async () => {
        let callCount = 0;
        jest.mocked(mockBackend.sendMessageStream).mockImplementation(async function* () {
          callCount++;
          yield {
            type: AgentEventType.TextChunk,
            messageId: `msg-${callCount}`,
            content: `Message ${callCount}`,
            timestamp: callCount * 1000,
          };
        });
        await collectElements(session);
        await collectElements(session);
      });

      it('accumulates elements from all streams', () => {
        expect(session.elements).toHaveLength(2);
        expect(session.elements[0]).toEqual(expect.objectContaining({ id: 'msg-1' }));
        expect(session.elements[1]).toEqual(expect.objectContaining({ id: 'msg-2' }));
      });
    });
  });

  describe('isLoading', () => {
    describe('when session is idle', () => {
      it('returns false', () => {
        expect(session.isLoading).toBe(false);
      });
    });

    describe('during streaming', () => {
      let isLoadingStatesDuringStream: boolean[];

      beforeEach(async () => {
        jest.mocked(mockBackend.sendMessageStream).mockImplementation(async function* () {
          yield {
            type: AgentEventType.TextChunk,
            messageId: 'msg-1',
            content: 'Hello',
            timestamp: 1000,
          };
        });

        isLoadingStatesDuringStream = [];
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of session.sendMessageStream(mockAction)) {
          isLoadingStatesDuringStream.push(session.isLoading);
        }
      });

      it('returns true', () => {
        expect(isLoadingStatesDuringStream.slice(0, -1)).toEqual([true]);
      });
    });

    describe('after streaming completes', () => {
      beforeEach(async () => {
        jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
          asyncGeneratorFromArray([
            {
              type: AgentEventType.TextChunk,
              messageId: 'msg-1',
              content: 'Hello',
              timestamp: 1000,
            },
          ]),
        );
        await collectElements(session);
      });

      it('returns false', () => {
        expect(session.isLoading).toBe(false);
      });
    });

    describe('when stream throws an error', () => {
      let elements: ChatElement[];

      beforeEach(async () => {
        jest.mocked(mockBackend.sendMessageStream).mockImplementation(async function* () {
          yield {
            type: AgentEventType.TextChunk,
            messageId: 'msg-1',
            content: 'Starting...',
            timestamp: 1000,
          };
          throw new Error('Stream failed');
        });

        elements = await collectElements(session);
      });

      it('sets isLoading to false', () => {
        expect(session.isLoading).toBe(false);
      });

      it('does not finalize any incomplete messages', () => {
        expect(elements).toHaveLength(2);
        expect(elements[0]).toEqual(
          expect.objectContaining({
            id: 'msg-1',
            type: 'message',
            content: 'Starting...',
            isComplete: false,
          }),
        );
      });

      it('yields an error element', () => {
        expect(elements[1].type).toBe('error');
        if (elements[1].type === 'error') {
          expect(elements[1].error).toBe(
            'Sorry, there was an error processing your message. Please try again.',
          );
        }
      });
    });
  });

  describe('addUserMessageAndStartLoading', () => {
    describe('when adding a single message', () => {
      beforeEach(() => {
        session.addUserMessageAndStartLoading('Hello there!');
      });

      it('appends a user message to the internal array', () => {
        expect(session.elements).toHaveLength(1);
        expect(session.elements[0]).toEqual(
          expect.objectContaining({
            type: 'message',
            role: 'user',
            content: 'Hello there!',
            isComplete: true,
          }),
        );
      });
    });

    describe('when adding message before streaming', () => {
      beforeEach(async () => {
        jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
          asyncGeneratorFromArray([
            {
              type: AgentEventType.TextChunk,
              messageId: 'assistant-msg',
              content: 'Response',
              timestamp: 2000,
            },
          ]),
        );

        session.addUserMessageAndStartLoading('Hello');
        await collectElements(session);
      });

      it('preserves existing elements when adding new ones', () => {
        expect(session.elements).toHaveLength(2);
        expect(session.elements[0]).toEqual(expect.objectContaining({ content: 'Hello' }));
        expect(session.elements[1]).toEqual(expect.objectContaining({ id: 'assistant-msg' }));
      });
    });

    describe('when adding multiple messages', () => {
      beforeEach(() => {
        session.addUserMessageAndStartLoading('First');
        session.addUserMessageAndStartLoading('Second');
      });

      it('allows adding multiple messages sequentially', () => {
        expect(session.elements).toHaveLength(2);
        expect(session.elements[0]).toEqual(expect.objectContaining({ content: 'First' }));
        expect(session.elements[1]).toEqual(expect.objectContaining({ content: 'Second' }));
      });
    });
  });

  describe('sendMessageStream', () => {
    describe('when receiving TextChunk events', () => {
      describe('with a single chunk', () => {
        let yieldedElements: ChatElement[];

        beforeEach(async () => {
          jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
            asyncGeneratorFromArray([
              {
                type: AgentEventType.TextChunk,
                messageId: 'msg-1',
                content: 'Hello :)',
                timestamp: 1000,
              },
            ]),
          );
          yieldedElements = await collectElements(session);
        });

        it('yields streaming element followed by finalized element', () => {
          expect(yieldedElements).toHaveLength(2);
          expect(yieldedElements[0]).toEqual({
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            content: 'Hello :)',
            timestamp: 1000,
            isComplete: false,
          });
          expect(yieldedElements[1]).toEqual({
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            content: 'Hello :)',
            timestamp: 1000,
            isComplete: true,
          });
        });

        it('stores the message in elements', () => {
          expect(session.elements).toHaveLength(1);
          expect(session.elements[0]).toEqual(
            expect.objectContaining({
              id: 'msg-1',
              content: 'Hello :)',
            }),
          );
        });
      });

      describe('with multiple chunks for the same message', () => {
        let yieldedElements: ChatElement[];

        beforeEach(async () => {
          jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
            asyncGeneratorFromArray([
              {
                type: AgentEventType.TextChunk,
                messageId: 'msg-1',
                content: 'Hello ',
                timestamp: 1000,
              },
              {
                type: AgentEventType.TextChunk,
                messageId: 'msg-1',
                content: 'world',
                timestamp: 1001,
              },
            ]),
          );
          yieldedElements = await collectElements(session);
        });

        it('accumulates content into the message with finalized element at end', () => {
          expect(yieldedElements).toHaveLength(3);
          expect(yieldedElements[0]).toEqual(
            expect.objectContaining({ content: 'Hello ', isComplete: false }),
          );
          expect(yieldedElements[1]).toEqual(
            expect.objectContaining({ content: 'Hello world', isComplete: false }),
          );
          expect(yieldedElements[2]).toEqual(
            expect.objectContaining({ content: 'Hello world', isComplete: true }),
          );
        });

        it('updates the stored element in place', () => {
          expect(session.elements).toHaveLength(1);
          expect(session.elements[0]).toEqual(
            expect.objectContaining({
              id: 'msg-1',
              content: 'Hello world',
            }),
          );
        });
      });

      describe('when messageId changes', () => {
        let yieldedElements: ChatElement[];

        beforeEach(async () => {
          jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
            asyncGeneratorFromArray([
              {
                type: AgentEventType.TextChunk,
                messageId: 'msg-1',
                content: 'First',
                timestamp: 1000,
              },
              {
                type: AgentEventType.TextChunk,
                messageId: 'msg-2',
                content: 'Second',
                timestamp: 2000,
              },
            ]),
          );
          yieldedElements = await collectElements(session);
        });

        it('yields completed first message before starting fresh message', () => {
          expect(yieldedElements).toHaveLength(4);
          expect(yieldedElements[0]).toEqual(
            expect.objectContaining({ id: 'msg-1', content: 'First', isComplete: false }),
          );
          expect(yieldedElements[1]).toEqual(
            expect.objectContaining({ id: 'msg-1', content: 'First', isComplete: true }),
          );
          expect(yieldedElements[2]).toEqual(
            expect.objectContaining({ id: 'msg-2', content: 'Second', isComplete: false }),
          );
          expect(yieldedElements[3]).toEqual(
            expect.objectContaining({ id: 'msg-2', content: 'Second', isComplete: true }),
          );
        });

        it('stores both messages in elements', () => {
          expect(session.elements).toHaveLength(2);
          expect(session.elements[0]).toEqual(expect.objectContaining({ id: 'msg-1' }));
          expect(session.elements[1]).toEqual(expect.objectContaining({ id: 'msg-2' }));
        });
      });
    });

    describe('when receiving ToolStart event', () => {
      const toolInput: ToolInput = { tool: 'read_file', filepath: '/test.txt' };
      let yieldedElements: ChatElement[];

      beforeEach(async () => {
        jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
          asyncGeneratorFromArray([
            {
              type: AgentEventType.ToolStart,
              toolId: 't1',
              name: 'read_file',
              input: toolInput,
              timestamp: 1000,
            },
          ]),
        );
        yieldedElements = await collectElements(session);
      });

      it('yields a tool call with loading state', () => {
        expect(yieldedElements).toHaveLength(1);
        expect(yieldedElements[0]).toEqual(
          expect.objectContaining({
            id: 't1',
            type: 'tool',
            name: 'read_file',
            state: { type: 'loading' },
          }),
        );
      });

      it('stores the tool call in elements', () => {
        expect(session.elements).toHaveLength(1);
        expect(session.elements[0]).toEqual(
          expect.objectContaining({
            id: 't1',
            type: 'tool',
            state: { type: 'loading' },
          }),
        );
      });
    });

    describe('when receiving ToolComplete event', () => {
      const toolInput: ToolInput = { tool: 'read_file', filepath: '/test.txt' };

      describe('after a matching ToolStart', () => {
        let yieldedElements: ChatElement[];

        beforeEach(async () => {
          jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
            asyncGeneratorFromArray([
              {
                type: AgentEventType.ToolStart,
                toolId: 't1',
                name: 'read_file',
                input: toolInput,
                timestamp: 1000,
              },
              {
                type: AgentEventType.ToolComplete,
                toolId: 't1',
                result: 'file contents',
                timestamp: 2000,
              },
            ]),
          );
          yieldedElements = await collectElements(session);
        });

        it('yields a tool call with success state', () => {
          expect(yieldedElements[1]).toEqual(
            expect.objectContaining({
              id: 't1',
              type: 'tool',
              state: { type: 'success', output: 'file contents' },
            }),
          );
        });

        it('updates the stored tool call', () => {
          expect(session.elements).toHaveLength(1);
          expect(session.elements[0]).toEqual(
            expect.objectContaining({
              id: 't1',
              state: { type: 'success', output: 'file contents' },
            }),
          );
        });
      });

      describe('with an error', () => {
        let yieldedElements: ChatElement[];

        beforeEach(async () => {
          jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
            asyncGeneratorFromArray([
              {
                type: AgentEventType.ToolStart,
                toolId: 't1',
                name: 'read_file',
                input: toolInput,
                timestamp: 1000,
              },
              {
                type: AgentEventType.ToolComplete,
                toolId: 't1',
                result: '',
                error: 'File not found :<',
                timestamp: 2000,
              },
            ]),
          );
          yieldedElements = await collectElements(session);
        });

        it('yields a tool call with error state', () => {
          expect(yieldedElements[1]).toEqual(
            expect.objectContaining({
              id: 't1',
              type: 'tool',
              state: { type: 'error', error: 'File not found :<' },
            }),
          );
        });

        it('updates the stored tool call with error', () => {
          expect(session.elements).toHaveLength(1);
          expect(session.elements[0]).toEqual(
            expect.objectContaining({
              id: 't1',
              state: { type: 'error', error: 'File not found :<' },
            }),
          );
        });
      });

      describe('without a matching ToolStart', () => {
        let yieldedElements: ChatElement[];

        beforeEach(async () => {
          jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
            asyncGeneratorFromArray([
              {
                type: AgentEventType.ToolComplete,
                toolId: 'unknown-tool',
                result: 'result',
                timestamp: 1000,
              },
            ]),
          );
          yieldedElements = await collectElements(session);
        });

        it('yields nothing', () => {
          expect(yieldedElements).toHaveLength(0);
        });

        it('does not add anything to elements', () => {
          expect(session.elements).toHaveLength(0);
        });
      });
    });

    describe('when receiving ToolAwaitingApproval event', () => {
      const toolInput: ToolInput = { tool: 'run_command', command: 'rm -rf /' };

      describe('without a prior ToolStart', () => {
        let yieldedElements: ChatElement[];

        beforeEach(async () => {
          jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
            asyncGeneratorFromArray([
              {
                type: AgentEventType.ToolAwaitingApproval,
                toolId: 't1',
                toolName: 'run_command',
                input: toolInput,
                content: 'This will delete everything :O',
                timestamp: 1000,
                availableScopes: ['once'],
              },
            ]),
          );
          yieldedElements = await collectElements(session);
        });

        it('yields a tool call with approval_request state', () => {
          expect(yieldedElements).toHaveLength(1);
          expect(yieldedElements[0]).toEqual(
            expect.objectContaining({
              id: 't1',
              type: 'tool',
              name: 'run_command',
              state: { type: 'approval_request', content: '', availableScopes: ['once'] },
            }),
          );
        });

        it('stores the tool call in elements', () => {
          expect(session.elements).toHaveLength(1);
          expect(session.elements[0]).toEqual(
            expect.objectContaining({
              id: 't1',
              type: 'tool',
              state: { type: 'approval_request', content: '', availableScopes: ['once'] },
            }),
          );
        });
      });

      describe('after a matching ToolStart', () => {
        let yieldedElements: ChatElement[];

        beforeEach(async () => {
          jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
            asyncGeneratorFromArray([
              {
                type: AgentEventType.ToolStart,
                toolId: 't1',
                name: 'run_command',
                input: toolInput,
                timestamp: 1000,
              },
              {
                type: AgentEventType.ToolAwaitingApproval,
                toolId: 't1',
                toolName: 'run_command',
                input: toolInput,
                content: 'Confirm deletion?',
                timestamp: 2000,
                availableScopes: ['once'],
              },
            ]),
          );
          yieldedElements = await collectElements(session);
        });

        it('updates the existing tool call to approval_request state', () => {
          expect(yieldedElements).toHaveLength(2);
          expect(yieldedElements[1]).toEqual(
            expect.objectContaining({
              id: 't1',
              type: 'tool',
              state: { type: 'approval_request', content: '', availableScopes: ['once'] },
            }),
          );
        });

        it('updates the stored element in place', () => {
          expect(session.elements).toHaveLength(1);
          expect(session.elements[0]).toEqual(
            expect.objectContaining({
              id: 't1',
              state: { type: 'approval_request', content: '', availableScopes: ['once'] },
            }),
          );
        });
      });

      describe('after text chunks', () => {
        beforeEach(async () => {
          jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
            asyncGeneratorFromArray([
              {
                type: AgentEventType.TextChunk,
                messageId: 'msg-1',
                content: 'Let me run a command',
                timestamp: 1000,
              },
              {
                type: AgentEventType.ToolAwaitingApproval,
                toolId: 't1',
                toolName: 'run_command',
                input: toolInput,
                content: 'Confirm?',
                timestamp: 2000,
                availableScopes: ['once'],
              },
            ]),
          );
          await collectElements(session);
        });

        it('marks the assistant message complete before the tool', () => {
          const message = session.elements.find((el) => el.type === 'message');
          expect(message).toEqual(
            expect.objectContaining({
              id: 'msg-1',
              isComplete: true,
            }),
          );
        });

        it('stores both elements', () => {
          expect(session.elements).toHaveLength(2);
          expect(session.elements[0].type).toBe('message');
          expect(session.elements[1].type).toBe('tool');
        });
      });
    });

    describe('when receiving Error event', () => {
      let yieldedElements: ChatElement[];

      beforeEach(async () => {
        jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
          asyncGeneratorFromArray([
            {
              type: AgentEventType.Error,
              message: 'Something went wrong :(',
              timestamp: 1000,
            },
          ]),
        );
        yieldedElements = await collectElements(session);
      });

      it('yields an ErrorMessage', () => {
        expect(yieldedElements).toHaveLength(1);
        expect(yieldedElements[0]).toEqual(
          expect.objectContaining({
            type: 'error',
            error: 'Something went wrong :(',
            timestamp: 1000,
          }),
        );
        expect((yieldedElements[0] as { id: string }).id).toMatch(/^error-[0-9a-f-]+$/);
      });

      it('stores the error in elements', () => {
        expect(session.elements).toHaveLength(1);
        expect(session.elements[0]).toEqual(
          expect.objectContaining({
            type: 'error',
            error: 'Something went wrong :(',
          }),
        );
        expect((session.elements[0] as { id: string }).id).toMatch(/^error-[0-9a-f-]+$/);
      });
    });

    describe('isComplete flag on assistant messages', () => {
      describe('during streaming', () => {
        let messageStatesDuringStream: ChatElement[];

        beforeEach(async () => {
          jest.mocked(mockBackend.sendMessageStream).mockImplementation(async function* () {
            yield {
              type: AgentEventType.TextChunk,
              messageId: 'msg-1',
              content: 'Hello',
              timestamp: 1000,
            };
          });

          messageStatesDuringStream = [];
          for await (const element of session.sendMessageStream(mockAction)) {
            if (element.type !== AgentEventType.Retry) {
              messageStatesDuringStream.push(element);
            }
          }
        });

        it('marks streaming messages as incomplete, final message as complete', () => {
          expect(messageStatesDuringStream.slice(0, -1)).toEqual([
            expect.objectContaining({ isComplete: false }),
          ]);
          expect(messageStatesDuringStream.at(-1)).toEqual(
            expect.objectContaining({ isComplete: true }),
          );
        });
      });

      describe('after stream ends', () => {
        beforeEach(async () => {
          jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
            asyncGeneratorFromArray([
              {
                type: AgentEventType.TextChunk,
                messageId: 'msg-1',
                content: 'Hello',
                timestamp: 1000,
              },
            ]),
          );
          await collectElements(session);
        });

        it('marks the message as complete', () => {
          const storedMessage = session.elements[0];
          expect(storedMessage).toEqual(
            expect.objectContaining({
              type: 'message',
              isComplete: true,
            }),
          );
        });
      });

      describe('with multiple messages in a turn', () => {
        beforeEach(async () => {
          jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
            asyncGeneratorFromArray([
              {
                type: AgentEventType.TextChunk,
                messageId: 'msg-1',
                content: 'First',
                timestamp: 1000,
              },
              {
                type: AgentEventType.TextChunk,
                messageId: 'msg-2',
                content: 'Second',
                timestamp: 2000,
              },
            ]),
          );
          await collectElements(session);
        });

        it('marks the first message complete when a new message starts, and the last message complete at turn end', () => {
          expect(session.elements[0]).toEqual(
            expect.objectContaining({ id: 'msg-1', isComplete: true }),
          );
          expect(session.elements[1]).toEqual(
            expect.objectContaining({ id: 'msg-2', isComplete: true }),
          );
        });
      });
    });

    describe('turn state management', () => {
      describe('when making multiple requests on the same session', () => {
        let firstElements: ChatElement[];
        let secondElements: ChatElement[];

        beforeEach(async () => {
          let callCount = 0;
          jest.mocked(mockBackend.sendMessageStream).mockImplementation(async function* () {
            callCount++;
            yield {
              type: AgentEventType.TextChunk,
              messageId: `msg-${callCount}`,
              content: `Stream ${callCount}`,
              timestamp: callCount * 1000,
            };
          });

          firstElements = await collectElements(session);
          secondElements = await collectElements(session);
        });

        it('resets turn state between streams', () => {
          expect(firstElements[0]).toEqual(
            expect.objectContaining({ id: 'msg-1', content: 'Stream 1' }),
          );
          expect(secondElements[0]).toEqual(
            expect.objectContaining({ id: 'msg-2', content: 'Stream 2' }),
          );
        });
      });

      describe('when tool calls span multiple streams', () => {
        const toolInput: ToolInput = { tool: 'read_file', filepath: '/test.txt' };

        beforeEach(async () => {
          let callCount = 0;
          jest.mocked(mockBackend.sendMessageStream).mockImplementation(async function* () {
            callCount++;
            yield {
              type: AgentEventType.ToolStart,
              toolId: `tool-${callCount}`,
              name: 'read_file',
              input: toolInput,
              timestamp: callCount * 1000,
            };
          });

          await collectElements(session);
          await collectElements(session);
        });

        it('clears tool call tracking between streams', () => {
          expect(session.elements).toHaveLength(2);
          expect(session.elements[0]).toEqual(expect.objectContaining({ id: 'tool-1' }));
          expect(session.elements[1]).toEqual(expect.objectContaining({ id: 'tool-2' }));
        });
      });
    });
  });

  describe('rehydrateFromEvents', () => {
    describe('when called with an empty array', () => {
      beforeEach(() => {
        session.rehydrateFromEvents([]);
      });

      it('leaves elements empty', () => {
        expect(session.elements).toEqual([]);
      });

      it('sets isLoading to false', () => {
        expect(session.isLoading).toBe(false);
      });
    });

    describe('when called with UserMessage events', () => {
      beforeEach(() => {
        session.rehydrateFromEvents([
          {
            type: UserEventType.UserMessage,
            messageId: 'user-1',
            content: 'Hello',
            timestamp: 1000,
          },
          {
            type: UserEventType.UserMessage,
            messageId: 'user-2',
            content: 'Follow up',
            timestamp: 2000,
          },
        ]);
      });

      it('creates user Message elements with isComplete true', () => {
        expect(session.elements).toHaveLength(2);
        expect(session.elements[0]).toEqual(
          expect.objectContaining({
            id: 'user-1',
            type: 'message',
            role: 'user',
            content: 'Hello',
            timestamp: 1000,
            isComplete: true,
          }),
        );
        expect(session.elements[1]).toEqual(
          expect.objectContaining({
            id: 'user-2',
            type: 'message',
            role: 'user',
            content: 'Follow up',
            timestamp: 2000,
            isComplete: true,
          }),
        );
      });
    });

    describe('when called with TextChunk events', () => {
      beforeEach(() => {
        session.rehydrateFromEvents([
          {
            type: AgentEventType.TextChunk,
            messageId: 'msg-1',
            content: 'Hello ',
            timestamp: 1000,
          },
          {
            type: AgentEventType.TextChunk,
            messageId: 'msg-1',
            content: 'world',
            timestamp: 1001,
          },
        ]);
      });

      it('creates an assistant Message element with accumulated content', () => {
        expect(session.elements).toHaveLength(1);
        expect(session.elements[0]).toEqual(
          expect.objectContaining({
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            content: 'Hello world',
          }),
        );
      });

      it('marks the message as complete', () => {
        expect(session.elements[0]).toEqual(expect.objectContaining({ isComplete: true }));
      });
    });

    describe('when called with ToolAwaitingApproval and ToolComplete events', () => {
      const toolInput: ToolInput = { tool: 'run_command', command: 'ls -la' };

      beforeEach(() => {
        session.rehydrateFromEvents([
          {
            type: AgentEventType.ToolAwaitingApproval,
            toolId: 't1',
            toolName: 'run_command',
            input: toolInput,
            content: 'Approve?',
            timestamp: 1000,
            availableScopes: ['once'],
          },
          {
            type: AgentEventType.ToolComplete,
            toolId: 't1',
            result: 'output here',
            timestamp: 2000,
          },
        ]);
      });

      it('creates a single tool element with success state', () => {
        expect(session.elements).toHaveLength(1);
        expect(session.elements[0]).toEqual(
          expect.objectContaining({
            id: 't1',
            type: 'tool',
            name: 'run_command',
            state: { type: 'success', output: 'output here' },
          }),
        );
      });
    });

    describe('when called with a mixed sequence of events', () => {
      const toolInput: ToolInput = { tool: 'read_file', filepath: '/test.txt' };

      beforeEach(() => {
        session.rehydrateFromEvents([
          {
            type: UserEventType.UserMessage,
            messageId: 'user-1',
            content: 'Read that file',
            timestamp: 1000,
          },
          {
            type: AgentEventType.TextChunk,
            messageId: 'assistant-1',
            content: 'Sure, let me read it',
            timestamp: 2000,
          },
          {
            type: AgentEventType.ToolAwaitingApproval,
            toolId: 't1',
            toolName: 'read_file',
            input: toolInput,
            content: 'Approve?',
            timestamp: 3000,
            availableScopes: ['once'],
          },
          {
            type: AgentEventType.ToolComplete,
            toolId: 't1',
            result: 'file contents',
            timestamp: 4000,
          },
          {
            type: UserEventType.UserMessage,
            messageId: 'user-2',
            content: 'Thanks',
            timestamp: 5000,
          },
          {
            type: AgentEventType.TextChunk,
            messageId: 'assistant-2',
            content: 'You are welcome',
            timestamp: 6000,
          },
        ]);
      });

      it('creates the correct number of elements', () => {
        expect(session.elements).toHaveLength(5);
      });

      it('creates elements in the correct order with correct types', () => {
        expect(session.elements[0]).toEqual(
          expect.objectContaining({
            id: 'user-1',
            type: 'message',
            role: 'user',
            isComplete: true,
          }),
        );
        expect(session.elements[1]).toEqual(
          expect.objectContaining({
            id: 'assistant-1',
            type: 'message',
            role: 'assistant',
            isComplete: true,
          }),
        );
        expect(session.elements[2]).toEqual(expect.objectContaining({ id: 't1', type: 'tool' }));
        expect(session.elements[3]).toEqual(
          expect.objectContaining({
            id: 'user-2',
            type: 'message',
            role: 'user',
            isComplete: true,
          }),
        );
        expect(session.elements[4]).toEqual(
          expect.objectContaining({
            id: 'assistant-2',
            type: 'message',
            role: 'assistant',
            isComplete: true,
          }),
        );
      });
    });

    describe('when called after existing elements', () => {
      beforeEach(() => {
        session.addUserMessageAndStartLoading('existing');
        session.rehydrateFromEvents([
          {
            type: UserEventType.UserMessage,
            messageId: 'rehydrated-1',
            content: 'rehydrated message',
            timestamp: 2000,
          },
        ]);
      });

      it('replaces existing elements with rehydrated ones', () => {
        expect(session.elements).toHaveLength(1);
        expect(session.elements[0]).toEqual(
          expect.objectContaining({ id: 'rehydrated-1', content: 'rehydrated message' }),
        );
      });
    });

    describe('when ToolComplete has no matching prior tool event', () => {
      beforeEach(() => {
        session.rehydrateFromEvents([
          {
            type: AgentEventType.ToolComplete,
            toolId: 'orphan-tool',
            result: 'result',
            timestamp: 1000,
          },
        ]);
      });

      it('silently drops the event', () => {
        expect(session.elements).toHaveLength(0);
      });
    });

    describe('after rehydration completes', () => {
      beforeEach(() => {
        session.addUserMessageAndStartLoading('trigger loading');
        session.rehydrateFromEvents([
          {
            type: AgentEventType.TextChunk,
            messageId: 'msg-1',
            content: 'response',
            timestamp: 1000,
          },
        ]);
      });

      it('sets isLoading to false', () => {
        expect(session.isLoading).toBe(false);
      });
    });
  });

  describe('cancelStream', () => {
    describe('when cancelling an active stream', () => {
      let receivedSignal: AbortSignal | undefined;
      let generator: AsyncGenerator<ChatElement | RetryAgentEvent>;

      beforeEach(async () => {
        jest.mocked(mockBackend.sendMessageStream).mockImplementation(async function* (
          _action: UserAction,
          signal?: AbortSignal,
        ) {
          receivedSignal = signal;
          yield {
            type: AgentEventType.TextChunk,
            messageId: 'msg-1',
            content: 'Starting...',
            timestamp: 1000,
          };
          await new Promise((resolve) => {
            setTimeout(resolve, 100);
          });
          yield {
            type: AgentEventType.TextChunk,
            messageId: 'msg-1',
            content: ' should not appear',
            timestamp: 2000,
          };
        });

        generator = session.sendMessageStream(mockAction);
        await generator.next();
        session.cancelStream();
      });

      it('aborts the backend stream', () => {
        expect(receivedSignal?.aborted).toBe(true);
      });
    });

    describe('when cancellation completes', () => {
      beforeEach(async () => {
        jest.mocked(mockBackend.sendMessageStream).mockImplementation(async function* (
          _action: UserAction,
          signal?: AbortSignal,
        ) {
          yield {
            type: AgentEventType.TextChunk,
            messageId: 'msg-1',
            content: 'Starting...',
            timestamp: 1000,
          };

          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, 100);
            signal?.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error('Aborted'));
            });
          });
        });

        const generator = session.sendMessageStream(mockAction);
        await generator.next();
        session.cancelStream();

        try {
          for await (const el of generator) {
            if (el) break;
          }
        } catch {
          // Expected abort error - generator now fully closed
        }
      });

      it('sets isLoading to false', () => {
        expect(session.isLoading).toBe(false);
      });
    });

    describe('when stream has partial content', () => {
      let generator: AsyncGenerator<ChatElement | RetryAgentEvent>;

      beforeEach(async () => {
        jest.mocked(mockBackend.sendMessageStream).mockImplementation(async function* (
          _action: UserAction,
          signal?: AbortSignal,
        ) {
          yield {
            type: AgentEventType.TextChunk,
            messageId: 'msg-1',
            content: 'Partial response...',
            timestamp: 1000,
          };

          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, 100);
            signal?.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error('Aborted'));
            });
          });
        });

        generator = session.sendMessageStream(mockAction);
        await generator.next();
        session.cancelStream();

        try {
          await generator.next();
        } catch {
          // Expected abort error
        }
      });

      it('marks the current assistant message as complete', () => {
        expect(session.elements[0]).toEqual(
          expect.objectContaining({
            id: 'msg-1',
            content: 'Partial response...',
            isComplete: true,
          }),
        );
      });
    });
  });

  describe('retryStatus', () => {
    describe('when session is new', () => {
      it('is undefined', () => {
        expect(session.retryStatus).toBeUndefined();
      });
    });

    describe('retry then success (TextChunk)', () => {
      it('yields the Retry event, sets retryStatus with a numeric startedAt and adds no element', async () => {
        jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
          asyncGeneratorFromArray([
            {
              type: AgentEventType.Retry,
              attempt: 1,
              maxAttempts: 5,
              backoffMs: 3000,
              timestamp: 1000,
            },
            {
              type: AgentEventType.TextChunk,
              messageId: 'msg-1',
              content: 'Hello',
              timestamp: 2000,
            },
          ]),
        );

        const yielded = await collectYielded(session);

        // The Retry event is yielded down the stream.
        const retryEvents = yielded.filter(
          (el): el is RetryAgentEvent => el.type === AgentEventType.Retry,
        );
        expect(retryEvents).toHaveLength(1);
        expect(retryEvents[0]).toEqual(
          expect.objectContaining({ attempt: 1, maxAttempts: 5, backoffMs: 3000 }),
        );

        // The Retry event produced no ChatElement: only the assistant message remains.
        const chatElements = yielded.filter((el) => el.type !== AgentEventType.Retry);
        expect(chatElements.filter((el) => el.type === 'message')).toHaveLength(2); // streaming + final
        expect(session.elements).toHaveLength(1);
        expect(session.elements[0]).toEqual(
          expect.objectContaining({ id: 'msg-1', type: 'message' }),
        );

        // After the TextChunk and finalizeTurn the status is cleared.
        expect(session.retryStatus).toBeUndefined();
      });
    });

    describe('observing the set state directly', () => {
      it('sets retryStatus while the Retry event is in flight (cleared by finalizeTurn)', async () => {
        jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
          asyncGeneratorFromArray([
            {
              type: AgentEventType.Retry,
              attempt: 2,
              maxAttempts: 5,
              backoffMs: 4000,
              timestamp: 1000,
            },
          ]),
        );

        const generator = session.sendMessageStream(mockAction);

        // The first yield is the Retry event; retryStatus is set at this point.
        const first = await generator.next();
        expect(first.done).toBe(false);
        expect(first.value).toEqual(
          expect.objectContaining({ type: AgentEventType.Retry, attempt: 2 }),
        );
        expect(session.retryStatus).toEqual(
          expect.objectContaining({ attempt: 2, maxAttempts: 5, backoffMs: 4000 }),
        );

        // Drain the rest; finalizeTurn clears the status and no ChatElement is added.
        const rest: (ChatElement | RetryAgentEvent)[] = [];
        // eslint-disable-next-line no-await-in-loop
        for (let r = await generator.next(); !r.done; r = await generator.next()) {
          rest.push(r.value);
        }
        expect(rest).toHaveLength(0);
        expect(session.elements).toHaveLength(0);
        expect(session.retryStatus).toBeUndefined();
      });
    });

    describe('retry then retry then success', () => {
      it('updates retryStatus to the latest attempt and clears it after a real event', async () => {
        jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
          asyncGeneratorFromArray([
            {
              type: AgentEventType.Retry,
              attempt: 1,
              maxAttempts: 5,
              backoffMs: 1000,
              timestamp: 1000,
            },
            {
              type: AgentEventType.Retry,
              attempt: 2,
              maxAttempts: 5,
              backoffMs: 2000,
              timestamp: 2000,
            },
            {
              type: AgentEventType.TextChunk,
              messageId: 'msg-1',
              content: 'Recovered',
              timestamp: 3000,
            },
          ]),
        );

        const yielded = await collectYielded(session);

        // Both Retry events are yielded, in order.
        const retryEvents = yielded.filter(
          (el): el is RetryAgentEvent => el.type === AgentEventType.Retry,
        );
        expect(retryEvents.map((e) => e.attempt)).toEqual([1, 2]);

        // Cleared after the real event / finalize.
        expect(session.retryStatus).toBeUndefined();
        // Only the assistant message element exists; retries add nothing.
        expect(session.elements).toHaveLength(1);
        expect(session.elements[0]).toEqual(expect.objectContaining({ id: 'msg-1' }));
      });
    });

    describe('retry then error', () => {
      it('clears retryStatus when the Error event arrives and produces an error element', async () => {
        jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
          asyncGeneratorFromArray([
            {
              type: AgentEventType.Retry,
              attempt: 1,
              maxAttempts: 3,
              backoffMs: 1000,
              timestamp: 1000,
            },
            {
              type: AgentEventType.Error,
              message: 'Gave up after retries',
              timestamp: 2000,
            },
          ]),
        );

        const elements = await collectElements(session);

        // The Retry produces no ChatElement; the Error produces exactly one.
        expect(elements).toHaveLength(1);
        expect(elements[0].type).toBe('error');
        if (elements[0].type === 'error') {
          expect(elements[0].error).toBe('Gave up after retries');
        }
        expect(session.retryStatus).toBeUndefined();
        expect(session.elements).toHaveLength(1);
        expect(session.elements[0].type).toBe('error');
      });
    });

    describe('abort/cancel while retryStatus is set', () => {
      it('clears retryStatus when the turn is finalized', async () => {
        jest.mocked(mockBackend.sendMessageStream).mockImplementation(async function* (
          _action: UserAction,
          signal?: AbortSignal,
        ) {
          yield {
            type: AgentEventType.Retry,
            attempt: 1,
            maxAttempts: 3,
            backoffMs: 5000,
            timestamp: 1000,
          };
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, 100);
            signal?.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error('Aborted'));
            });
          });
        });

        const generator = session.sendMessageStream(mockAction);
        // The Retry event is the first yielded value, and it sets retryStatus.
        const first = await generator.next();
        expect(first.done).toBe(false);
        expect(first.value).toEqual(
          expect.objectContaining({ type: AgentEventType.Retry, attempt: 1 }),
        );

        // Precondition: the Retry event set retryStatus before we cancel.
        expect(session.retryStatus).toEqual({
          attempt: 1,
          maxAttempts: 3,
          backoffMs: 5000,
          startedAt: expect.any(Number),
        });

        session.cancelStream();

        try {
          // eslint-disable-next-line no-await-in-loop
          for (let r = await generator.next(); !r.done; r = await generator.next());
        } catch {
          // Expected abort error - generator now finalized.
        }

        // finalizeTurn (in the finally block) clears retryStatus.
        expect(session.retryStatus).toBeUndefined();
        expect(session.isLoading).toBe(false);
      });
    });

    describe('clearing retry status', () => {
      it('clears retry status when a subsequent non-retry event arrives', async () => {
        jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
          asyncGeneratorFromArray([
            {
              type: AgentEventType.Retry,
              attempt: 3,
              maxAttempts: 5,
              backoffMs: 4000,
              timestamp: 1000,
            },
            {
              type: AgentEventType.TextChunk,
              messageId: 'msg-1',
              content: 'Recovered',
              timestamp: 2000,
            },
          ]),
        );

        const yielded = await collectYielded(session);

        // The Retry event is yielded with the right fields.
        const retryEvents = yielded.filter(
          (el): el is RetryAgentEvent => el.type === AgentEventType.Retry,
        );
        expect(retryEvents).toHaveLength(1);
        expect(retryEvents[0]).toEqual(
          expect.objectContaining({ attempt: 3, maxAttempts: 5, backoffMs: 4000 }),
        );

        // Only the assistant message is yielded as a ChatElement.
        const chatElements = yielded.filter((el) => el.type !== AgentEventType.Retry);
        expect(chatElements.every((el) => el.type === 'message')).toBe(true);
        expect(session.elements).toHaveLength(1);
        expect(session.elements[0]).toEqual(
          expect.objectContaining({ id: 'msg-1', type: 'message', content: 'Recovered' }),
        );
        expect(session.retryStatus).toBeUndefined();
      });

      it('yields no Retry event and leaves retryStatus undefined when there was no retry', async () => {
        jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
          asyncGeneratorFromArray([
            {
              type: AgentEventType.TextChunk,
              messageId: 'msg-1',
              content: 'Hello',
              timestamp: 2000,
            },
          ]),
        );

        const yielded = await collectYielded(session);

        // No Retry event was yielded and the status stays undefined.
        expect(yielded.some((el) => el.type === AgentEventType.Retry)).toBe(false);
        expect(session.retryStatus).toBeUndefined();
        expect(session.elements).toHaveLength(1);
        expect(session.elements[0]).toEqual(
          expect.objectContaining({ id: 'msg-1', type: 'message', content: 'Hello' }),
        );
        expect(yielded.every((el) => el.type === 'message')).toBe(true);
      });
    });

    describe('rehydrateFromEvents', () => {
      it('does NOT set retryStatus when a Retry event is among the rehydrated events', () => {
        session.rehydrateFromEvents([
          {
            type: UserEventType.UserMessage,
            messageId: 'user-1',
            content: 'Hi',
            timestamp: 1000,
          },
          {
            type: AgentEventType.Retry,
            attempt: 1,
            maxAttempts: 5,
            backoffMs: 3000,
            timestamp: 2000,
          },
          {
            type: AgentEventType.TextChunk,
            messageId: 'msg-1',
            content: 'Recovered',
            timestamp: 3000,
          },
        ]);

        // Rehydration drains synchronously and calls finalizeTurn, so retryStatus
        // must be undefined afterward.
        expect(session.retryStatus).toBeUndefined();
        // The Retry event adds no element; only the user + assistant messages.
        expect(session.elements).toHaveLength(2);
        expect(session.elements[0]).toEqual(expect.objectContaining({ id: 'user-1' }));
        expect(session.elements[1]).toEqual(expect.objectContaining({ id: 'msg-1' }));
      });
    });
  });

  describe('contextUsage', () => {
    it('is undefined for a new session', () => {
      expect(session.contextUsage).toBeUndefined();
    });

    it('tracks the latest usage from a TokenUsage event and produces no element', async () => {
      jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
        asyncGeneratorFromArray([
          { type: AgentEventType.TokenUsage, totalTokens: 73, maxTokens: 100, timestamp: 1000 },
          { type: AgentEventType.TextChunk, messageId: 'msg-1', content: 'Hi', timestamp: 2000 },
        ]),
      );

      await collectElements(session);

      expect(session.contextUsage).toEqual({ totalTokens: 73, maxTokens: 100 });
      // Only the assistant message is an element; TokenUsage adds none.
      expect(session.elements).toHaveLength(1);
      expect(session.elements[0]).toEqual(expect.objectContaining({ id: 'msg-1' }));
    });

    it('keeps only the most recent usage when multiple events arrive', async () => {
      jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
        asyncGeneratorFromArray([
          { type: AgentEventType.TokenUsage, totalTokens: 50, maxTokens: 200, timestamp: 1000 },
          { type: AgentEventType.TokenUsage, totalTokens: 120, maxTokens: 200, timestamp: 2000 },
        ]),
      );

      await collectElements(session);

      expect(session.contextUsage).toEqual({ totalTokens: 120, maxTokens: 200 });
    });

    it('persists across turns (not reset by finalizeTurn)', async () => {
      jest
        .mocked(mockBackend.sendMessageStream)
        .mockReturnValueOnce(
          asyncGeneratorFromArray([
            { type: AgentEventType.TokenUsage, totalTokens: 90, maxTokens: 100, timestamp: 1000 },
          ]),
        )
        .mockReturnValueOnce(asyncGeneratorFromArray([]));

      await collectElements(session);
      expect(session.contextUsage).toEqual({ totalTokens: 90, maxTokens: 100 });

      // A second turn with no usage event must not clear the prior value.
      await collectElements(session);
      expect(session.contextUsage).toEqual({ totalTokens: 90, maxTokens: 100 });
    });
  });

  describe('cancelStream — trailing events do not repaint the UI', () => {
    it('drops backend events that arrive after the user cancels', async () => {
      jest.mocked(mockBackend.sendMessageStream).mockImplementation(async function* () {
        yield {
          type: AgentEventType.TextChunk,
          messageId: 'before-cancel',
          content: 'before',
          timestamp: 1,
        };
        // These represent already-buffered checkpoints delivered a beat after
        // the user pressed ESC. Pre-fix they repainted the UI; now they must be
        // dropped once the stream is cancelled.
        yield {
          type: AgentEventType.TextChunk,
          messageId: 'after-cancel',
          content: 'after',
          timestamp: 2,
        };
      });

      for await (const el of session.sendMessageStream(mockAction)) {
        if (el.type !== AgentEventType.Retry && el.id === 'before-cancel') {
          session.cancelStream(); // aborts synchronously
        }
      }

      const ids = session.elements.map((e) => e.id);
      expect(ids).toContain('before-cancel');
      expect(ids).not.toContain('after-cancel');
    });

    it('applies all events for an uncancelled turn (no false positives)', async () => {
      jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
        asyncGeneratorFromArray([
          { type: AgentEventType.TextChunk, messageId: 'a', content: 'a', timestamp: 1 },
          { type: AgentEventType.TextChunk, messageId: 'b', content: 'b', timestamp: 2 },
        ]),
      );

      await collectElements(session);

      const ids = session.elements.map((e) => e.id);
      expect(ids).toEqual(['a', 'b']);
    });
  });

  describe('local journal mirroring (Patch A)', () => {
    it('mirrors backend-stream events and the synthesized user message, skipping Retry', async () => {
      const mirror = jest.fn();
      session = new ChatSession('mirror-session', mockBackend, mockLogger, mirror);

      // Synthesized user message: mirrored with a title (first message).
      session.addUserMessageAndStartLoading('Hello there');
      expect(mirror).toHaveBeenCalledTimes(1);
      expect(mirror).toHaveBeenCalledWith(
        'mirror-session',
        expect.objectContaining({ type: UserEventType.UserMessage, content: 'Hello there' }),
        'Hello there',
      );

      jest.mocked(mockBackend.sendMessageStream).mockReturnValue(
        asyncGeneratorFromArray([
          {
            type: AgentEventType.Retry,
            attempt: 1,
            maxAttempts: 3,
            backoffMs: 10,
            timestamp: 1,
          },
          { type: AgentEventType.TextChunk, messageId: 'm1', content: 'hi', timestamp: 2 },
        ]),
      );
      await collectYielded(session);

      // Retry is transient and never journaled; the TextChunk is.
      expect(mirror).toHaveBeenCalledTimes(2);
      expect(mirror).toHaveBeenLastCalledWith(
        'mirror-session',
        expect.objectContaining({ type: AgentEventType.TextChunk, messageId: 'm1' }),
        undefined,
      );

      // Second user message: no title (title is set once).
      session.addUserMessageAndStartLoading('follow-up');
      expect(mirror).toHaveBeenLastCalledWith(
        'mirror-session',
        expect.objectContaining({ content: 'follow-up' }),
        undefined,
      );
    });

    it('does not mirror during rehydration and never throws into the stream', async () => {
      const mirror = jest.fn(() => {
        throw new Error('journal exploded');
      });
      session = new ChatSession('mirror-session', mockBackend, mockLogger, mirror);

      // Rehydrated events came FROM the store/upstream — re-mirroring would
      // double-write (the data service already shadow-persists upstream reads).
      session.rehydrateFromEvents([
        { type: UserEventType.UserMessage, messageId: 'u1', content: 'old', timestamp: 1 },
        { type: AgentEventType.TextChunk, messageId: 'a1', content: 'reply', timestamp: 2 },
      ]);
      expect(mirror).not.toHaveBeenCalled();

      // A throwing mirror must not break the live stream.
      jest
        .mocked(mockBackend.sendMessageStream)
        .mockReturnValue(
          asyncGeneratorFromArray([
            { type: AgentEventType.TextChunk, messageId: 'm2', content: 'ok', timestamp: 3 },
          ]),
        );
      const elements = await collectElements(session);
      expect(elements.length).toBeGreaterThan(0);
    });
  });
});
