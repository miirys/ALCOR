import { toolApprovalTypes } from '../constants.ts';
import {
  createUserMessage,
  createErrorMessage,
  createToolApprovalMessage,
  mapChatMessage,
  randomizeArrayToNItems,
  hashMessage,
} from './chat_message_helpers';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mocked-uuid'),
}));

describe('Message helpers', () => {
  const mockDate = new Date('2023-01-01T00:00:00Z');
  const originalDate = global.Date;

  beforeEach(() => {
    global.Date = jest.fn(() => mockDate);
    global.Date.now = originalDate.now;
  });

  afterEach(() => {
    global.Date = originalDate;
    jest.clearAllMocks();
  });

  describe('createUserMessage', () => {
    it('creates a properly formatted user message', () => {
      const message = 'Hello, this is a test message';
      const contextItems = [
        {
          content: 'snippet',
        },
      ];
      const result = createUserMessage(message, contextItems);

      expect(result).toEqual({
        content: message,
        message_type: 'user',
        role: 'user',
        timestamp: mockDate,
        correlation_id: 'mocked-uuid',
        extras: {
          contextItems,
        },
      });
    });

    it('creates a user message with approval options', () => {
      const message = 'Hello, this is a test message';
      const contextItems = [];
      const approvalOptions = [
        { type: 'approve', text: 'Approve', primary: true },
        { type: 'reject', text: 'Reject' },
      ];
      const result = createUserMessage(message, contextItems, approvalOptions);

      expect(result).toEqual({
        content: message,
        message_type: 'user',
        role: 'user',
        timestamp: mockDate,
        correlation_id: 'mocked-uuid',
        extras: {
          contextItems,
        },
        approvalOptions,
      });
    });

    it('creates a user message without approval options when not provided', () => {
      const message = 'Hello, this is a test message';
      const contextItems = [];
      const result = createUserMessage(message, contextItems);

      expect(result).toEqual({
        content: message,
        message_type: 'user',
        role: 'user',
        timestamp: mockDate,
        correlation_id: 'mocked-uuid',
        extras: {
          contextItems,
        },
      });
      expect(result.approvalOptions).toBeUndefined();
    });
  });

  describe('createToolApprovalMessage', () => {
    it('creates a properly formatted tool approval message', () => {
      const content = 'Tool requires approval';
      const toolName = 'server_tool-two';
      const approvalOptions = [
        { type: toolApprovalTypes.APPROVE_TOOL_ONCE, text: 'Approve', primary: true },
        { type: toolApprovalTypes.APPROVE_FOR_SESSION, text: 'Approve for Session' },
      ];
      const result = createToolApprovalMessage(content, toolName, approvalOptions);

      expect(result).toEqual({
        content,
        message_type: 'agent',
        role: 'agent',
        timestamp: mockDate,
        correlation_id: 'mocked-uuid',
        toolName,
        approvalOptions,
      });
    });

    it('creates a tool approval message without approval options when not provided', () => {
      const content = 'Tool requires approval';
      const toolName = 'server_tool-two';
      const result = createToolApprovalMessage(content, toolName);

      expect(result).toEqual({
        content,
        message_type: 'agent',
        role: 'agent',
        timestamp: mockDate,
        correlation_id: 'mocked-uuid',
        toolName,
      });
      expect(result.approvalOptions).toBeUndefined();
    });
  });

  describe('createErrorMessage', () => {
    it('creates a properly formatted error message', () => {
      const error = { message: 'Something went wrong', code: 500 };
      const result = createErrorMessage(error);

      expect(result).toEqual({
        content: '',
        message_type: 'agent',
        role: 'agent',
        timestamp: mockDate,
        correlation_id: 'mocked-uuid',
        errors: [error],
      });
    });

    it('creates an error message when error string contains quota message', () => {
      const error = 'No credits remain for this billing period';
      const result = createErrorMessage(error);

      expect(result).toEqual({
        content: '',
        message_type: 'agent',
        role: 'agent',
        timestamp: mockDate,
        correlation_id: 'mocked-uuid',
        errors: [error],
      });
    });
  });

  describe('mapChatMessage', () => {
    const approveOnce = {
      type: toolApprovalTypes.APPROVE_TOOL_ONCE,
      text: 'Approve',
      primary: true,
    };
    const approveSession = {
      type: toolApprovalTypes.APPROVE_FOR_SESSION,
      text: 'Approve for Session',
    };
    const approveSessionDisabled = {
      ...approveSession,
      disabled: true,
      secondaryText: 'Disabled. Contact your administrator.',
    };

    describe('user messages', () => {
      describe('when additionalContext is present', () => {
        it('adds extras with contextItems', () => {
          const contextItems = [
            { id: '1', content: 'context item 1' },
            { id: '2', content: 'context item 2' },
          ];
          const message = {
            content: 'User message with context',
            message_type: 'user',
            timestamp: mockDate,
            correlation_id: 'test-id',
            additional_context: contextItems,
          };

          const result = mapChatMessage(message);

          expect(result.role).toBe('user');
          expect(result.extras).toEqual({ contextItems });
          expect(result.approvalOptions).toEqual([]);
        });
      });

      describe('when additionalContext is absent', () => {
        it('does not add extras', () => {
          const message = {
            content: 'User message without context',
            message_type: 'user',
            timestamp: mockDate,
            correlation_id: 'test-id',
          };

          const result = mapChatMessage(message);

          expect(result.role).toBe('user');
          expect(result.extras).toBeUndefined();
          expect(result.approvalOptions).toEqual([]);
        });
      });
    });

    describe('non-request messages', () => {
      it('sets approval options to empty array for agent messages', () => {
        const message = {
          content: 'Agent message',
          message_type: 'agent',
          timestamp: mockDate,
          correlation_id: 'test-id',
        };

        const result = mapChatMessage(message);

        expect(result.role).toBe('agent');
        expect(result.approvalOptions).toEqual([]);
      });

      it('sets approval options to empty array for request messages without tool_info', () => {
        const message = {
          content: 'Request without tool',
          message_type: 'request',
          timestamp: mockDate,
          correlation_id: 'test-id',
        };

        const result = mapChatMessage(message);

        expect(result.role).toBe('request');
        expect(result.approvalOptions).toEqual([]);
      });
    });

    describe('approval options for tool requests', () => {
      it.each`
        toolName         | supportsSessionApprovals | expectedOptions
        ${'server_tool'} | ${false}                 | ${[approveOnce, approveSessionDisabled]}
        ${'server_tool'} | ${true}                  | ${[approveOnce, approveSession]}
        ${'server_tool'} | ${true}                  | ${[approveOnce, approveSession]}
        ${'mcp_tool'}    | ${false}                 | ${[approveOnce, approveSessionDisabled]}
        ${'mcp_tool'}    | ${true}                  | ${[approveOnce, approveSession]}
        ${'mcp__tool'}   | ${false}                 | ${[approveOnce, approveSession]}
        ${'mcp__tool'}   | ${true}                  | ${[approveOnce, approveSession]}
        ${''}            | ${false}                 | ${[approveOnce, approveSessionDisabled]}
        ${''}            | ${true}                  | ${[approveOnce, approveSession]}
        ${null}          | ${false}                 | ${[approveOnce, approveSessionDisabled]}
        ${null}          | ${true}                  | ${[approveOnce, approveSession]}
        ${undefined}     | ${false}                 | ${[approveOnce, approveSessionDisabled]}
        ${undefined}     | ${true}                  | ${[approveOnce, approveSession]}
      `(
        'shows correct options for $toolName with supportsSessionApprovals=$supportsSessionApprovals',
        ({ toolName, supportsSessionApprovals, expectedOptions }) => {
          const message = {
            content: 'Tool requires approval',
            message_type: 'request',
            timestamp: mockDate,
            correlation_id: 'test-id',
            tool_info: {
              ...(toolName !== undefined && { name: toolName }),
              type: 'function_call',
            },
          };

          const result = mapChatMessage(message, supportsSessionApprovals);

          expect(result.approvalOptions).toEqual(expectedOptions);
        },
      );
    });

    describe('pattern approval options from suggested_patterns', () => {
      it('includes pattern options when supportsPatternApprovals is true and backend provides suggested_patterns', () => {
        const message = {
          content: 'Tool requires approval',
          message_type: 'request',
          timestamp: mockDate,
          correlation_id: 'test-id',
          tool_info: {
            name: 'run_command',
            args: { command: 'git checkout feature/login' },
            suggested_patterns: ['git checkout *', 'git *'],
          },
        };

        const result = mapChatMessage(message, true, true);

        expect(result.approvalOptions).toEqual([
          approveOnce,
          approveSession,
          {
            type: toolApprovalTypes.APPROVE_PATTERN_FOR_SESSION,
            text: 'Approve git checkout * for session',
            pattern: 'git checkout *',
          },
          {
            type: toolApprovalTypes.APPROVE_PATTERN_FOR_SESSION,
            text: 'Approve git * for session',
            pattern: 'git *',
          },
        ]);
      });

      it('does not include pattern options when supportsPatternApprovals is false', () => {
        const message = {
          content: 'Tool requires approval',
          message_type: 'request',
          timestamp: mockDate,
          correlation_id: 'test-id',
          tool_info: {
            name: 'run_command',
            args: { command: 'git checkout feature/login' },
            suggested_patterns: ['git checkout *'],
          },
        };

        const result = mapChatMessage(message, true, false);

        expect(result.approvalOptions).toEqual([approveOnce, approveSession]);
      });

      it('does not include pattern options when session approvals are disabled', () => {
        const message = {
          content: 'Tool requires approval',
          message_type: 'request',
          timestamp: mockDate,
          correlation_id: 'test-id',
          tool_info: {
            name: 'server_tool',
            args: {},
            suggested_patterns: ['*'],
          },
        };

        const result = mapChatMessage(message, false, true);

        expect(result.approvalOptions).toEqual([approveOnce, approveSessionDisabled]);
      });

      it('does not include pattern options when suggested_patterns is empty', () => {
        const message = {
          content: 'Tool requires approval',
          message_type: 'request',
          timestamp: mockDate,
          correlation_id: 'test-id',
          tool_info: {
            name: 'run_command',
            args: { command: 'npm test' },
            suggested_patterns: [],
          },
        };

        const result = mapChatMessage(message, true, true);

        expect(result.approvalOptions).toEqual([approveOnce, approveSession]);
      });

      it('does not include pattern options when suggested_patterns is absent', () => {
        const message = {
          content: 'Tool requires approval',
          message_type: 'request',
          timestamp: mockDate,
          correlation_id: 'test-id',
          tool_info: {
            name: 'run_command',
            args: { command: 'npm test' },
          },
        };

        const result = mapChatMessage(message, true, true);

        expect(result.approvalOptions).toEqual([approveOnce, approveSession]);
      });
    });
  });

  describe('randomizeArrayToNItems', () => {
    it.each`
      desc                                                  | inputArray         | inputLength | resultLength | resultArray
      ${'empty array when input array is empty'}            | ${[]}              | ${5}        | ${0}         | ${[]}
      ${'all items when n is greater than array length'}    | ${['a', 'b', 'c']} | ${5}        | ${3}         | ${['a', 'b', 'c']}
      ${'exactly n items when n is less than array length'} | ${['a', 'b', 'c']} | ${2}        | ${2}         | ${expect.any(Array)}
      ${'all items when n equals array length'}             | ${['a', 'b', 'c']} | ${3}        | ${3}         | ${['a', 'b', 'c']}
      ${'empty array when n is 0'}                          | ${['a', 'b', 'c']} | ${0}        | ${0}         | ${[]}
    `('returns $desc', ({ inputArray, inputLength, resultLength, resultArray }) => {
      const result = randomizeArrayToNItems(inputArray, inputLength);

      expect(result).toHaveLength(resultLength);
      if (resultArray.length) {
        expect(result).toEqual(expect.arrayContaining(resultArray));
      } else {
        result.forEach((item) => {
          expect(inputArray).toContain(item);
        });
      }
    });

    it('does not modify the original array', () => {
      const input = ['a', 'b', 'c', 'd'];
      const originalInput = [...input];

      randomizeArrayToNItems(input, 2);

      expect(input).toEqual(originalInput);
    });

    it('returns unique items (no duplicates)', () => {
      const input = ['a', 'b', 'c', 'd', 'e'];
      const result = randomizeArrayToNItems(input, 3);

      const uniqueItems = [...new Set(result)];
      expect(uniqueItems).toHaveLength(result.length);
    });

    it('handles single item array', () => {
      const input = ['single'];
      const result = randomizeArrayToNItems(input, 1);

      expect(result).toEqual(['single']);
    });

    it('produces different results on multiple calls (randomness check)', () => {
      const input = Array.from({ length: 10 }, (_, i) => i);
      const results = [];

      // Run multiple times to check for randomness
      for (let i = 0; i < 10; i += 1) {
        results.push(randomizeArrayToNItems(input, 5).join(','));
      }

      // At least some results should be different (very high probability)
      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBeGreaterThan(1);
    });
  });

  describe('hashMessage', () => {
    it('generates consistent hash for the same message', () => {
      const message = {
        content: 'Hello world',
        role: 'user',
        message_type: 'user',
        timestamp: '2023-01-01T00:00:00Z',
        chunkId: 1,
        status: 'success',
      };

      const hash1 = hashMessage(message);
      const hash2 = hashMessage(message);

      expect(hash1).toBe(hash2);
    });

    it('generates different hashes for different content', () => {
      const message1 = {
        content: 'Hello world',
        role: 'user',
        message_type: 'user',
        timestamp: '2023-01-01T00:00:00Z',
      };

      const message2 = {
        content: 'Different content',
        role: 'user',
        message_type: 'user',
        timestamp: '2023-01-01T00:00:00Z',
      };

      const hash1 = hashMessage(message1);
      const hash2 = hashMessage(message2);

      expect(hash1).not.toBe(hash2);
    });

    it('generates different hashes for different roles', () => {
      const message1 = {
        content: 'Hello world',
        role: 'user',
        message_type: 'user',
        timestamp: '2023-01-01T00:00:00Z',
      };

      const message2 = {
        content: 'Hello world',
        role: 'assistant',
        message_type: 'assistant',
        timestamp: '2023-01-01T00:00:00Z',
      };

      const hash1 = hashMessage(message1);
      const hash2 = hashMessage(message2);

      expect(hash1).not.toBe(hash2);
    });

    it('generates different hashes for different timestamps', () => {
      const message1 = {
        content: 'Hello world',
        role: 'user',
        message_type: 'user',
        timestamp: '2023-01-01T00:00:00Z',
      };

      const message2 = {
        content: 'Hello world',
        role: 'user',
        message_type: 'user',
        timestamp: '2023-01-01T00:00:01Z',
      };

      const hash1 = hashMessage(message1);
      const hash2 = hashMessage(message2);

      expect(hash1).not.toBe(hash2);
    });

    it('generates different hashes for different chunkIds', () => {
      const message1 = {
        content: 'Hello world',
        role: 'assistant',
        message_type: 'assistant',
        timestamp: '2023-01-01T00:00:00Z',
        chunkId: 1,
      };

      const message2 = {
        content: 'Hello world',
        role: 'assistant',
        message_type: 'assistant',
        timestamp: '2023-01-01T00:00:00Z',
        chunkId: 2,
      };

      const hash1 = hashMessage(message1);
      const hash2 = hashMessage(message2);

      expect(hash1).not.toBe(hash2);
    });

    it('generates different hashes for different status', () => {
      const message1 = {
        content: 'Hello world',
        role: 'assistant',
        message_type: 'assistant',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'pending',
      };

      const message2 = {
        content: 'Hello world',
        role: 'assistant',
        message_type: 'assistant',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'success',
      };

      const hash1 = hashMessage(message1);
      const hash2 = hashMessage(message2);

      expect(hash1).not.toBe(hash2);
    });

    it('handles messages with undefined/null fields', () => {
      const message = {
        content: 'Hello world',
        role: 'user',
        message_type: 'user',
        timestamp: '2023-01-01T00:00:00Z',
        chunkId: undefined,
        status: null,
      };

      const hash = hashMessage(message);

      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('ignores fields not included in hash calculation', () => {
      const message1 = {
        content: 'Hello world',
        role: 'user',
        message_type: 'user',
        timestamp: '2023-01-01T00:00:00Z',
        extras: { some: 'data' },
        correlation_id: 'id-1',
      };

      const message2 = {
        content: 'Hello world',
        role: 'user',
        message_type: 'user',
        timestamp: '2023-01-01T00:00:00Z',
        extras: { different: 'data' },
        correlation_id: 'id-2',
      };

      const hash1 = hashMessage(message1);
      const hash2 = hashMessage(message2);

      // Should be the same because extras and correlation_id are not hashed
      expect(hash1).toBe(hash2);
    });
  });
});
