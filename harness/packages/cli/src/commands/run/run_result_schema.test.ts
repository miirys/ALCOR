import { CHAT_ELEMENT_TYPES } from '@gitlab-org/tui';
import { RUN_RESULT_SCHEMA_VERSION, runResultSchema, type RunResult } from './run_result_schema';

const messageElement = {
  id: 'msg-1',
  type: CHAT_ELEMENT_TYPES.MESSAGE,
  role: 'assistant',
  content: 'All done.',
  timestamp: 1,
  isComplete: true,
};

const successToolCall = {
  id: 'tool-1',
  type: CHAT_ELEMENT_TYPES.TOOL,
  name: 'read_file',
  input: { tool: 'read_file', filepath: 'src/index.ts' },
  state: { type: 'success', output: 'file contents' },
  timestamp: 2,
};

const erroredToolCall = {
  id: 'tool-2',
  type: CHAT_ELEMENT_TYPES.TOOL,
  name: 'run_command',
  input: { tool: 'run_command', command: 'false' },
  state: { type: 'error', error: 'command failed' },
  timestamp: 3,
};

const infoElement = {
  id: 'info-1',
  type: CHAT_ELEMENT_TYPES.INFO,
  message: 'Session resumed.',
  timestamp: 5,
};

describe('runResultSchema', () => {
  describe('a success document', () => {
    it('validates cleanly', () => {
      const doc = {
        schemaVersion: RUN_RESULT_SCHEMA_VERSION,
        sessionId: 'sess-1',
        status: 'success',
        exitCode: 0,
        response: 'All done.',
        elements: [messageElement, successToolCall],
      };

      const result = runResultSchema.safeParse(doc);
      expect(result.success).toBe(true);
    });

    it('infers a usable RunResult type', () => {
      const doc: RunResult = {
        schemaVersion: RUN_RESULT_SCHEMA_VERSION,
        sessionId: 'sess-1',
        status: 'success',
        exitCode: 0,
        response: '',
        elements: [],
      };

      expect(runResultSchema.parse(doc).status).toBe('success');
    });
  });

  describe('an error document', () => {
    it('validates cleanly when status is "error" and error is populated', () => {
      const doc = {
        schemaVersion: RUN_RESULT_SCHEMA_VERSION,
        sessionId: 'sess-1',
        status: 'error',
        exitCode: 1,
        response: '',
        elements: [
          erroredToolCall,
          {
            id: 'err-1',
            type: CHAT_ELEMENT_TYPES.ERROR,
            error: 'workflow failed',
            timestamp: 4,
          },
        ],
        error: 'workflow failed',
      };

      const result = runResultSchema.safeParse(doc);
      expect(result.success).toBe(true);
    });
  });

  describe('transcript elements', () => {
    it('accepts a message and tool calls in both success and error states', () => {
      const doc = {
        schemaVersion: RUN_RESULT_SCHEMA_VERSION,
        sessionId: 'sess-1',
        status: 'success',
        exitCode: 0,
        response: 'done',
        elements: [messageElement, successToolCall, erroredToolCall],
      };

      expect(runResultSchema.safeParse(doc).success).toBe(true);
    });

    it('accepts an info element', () => {
      const doc = {
        schemaVersion: RUN_RESULT_SCHEMA_VERSION,
        sessionId: 'sess-1',
        status: 'success',
        exitCode: 0,
        response: 'done',
        elements: [messageElement, infoElement],
      };

      expect(runResultSchema.safeParse(doc).success).toBe(true);
    });

    it('preserves a tool call with an unknown (future) tool rather than rejecting it', () => {
      // The schema evolves independently of the backend tool set, so an
      // unrecognized tool must degrade to pass-through fidelity instead of
      // breaking json mode for the whole run.
      const futureToolCall = {
        id: 'tool-future',
        type: CHAT_ELEMENT_TYPES.TOOL,
        name: 'some_future_tool',
        input: { tool: 'some_future_tool', someNewField: 'value', count: 3 },
        state: { type: 'success', output: 'ok' },
        timestamp: 7,
      };
      const doc = {
        schemaVersion: RUN_RESULT_SCHEMA_VERSION,
        sessionId: 'sess-1',
        status: 'success',
        exitCode: 0,
        response: 'done',
        elements: [futureToolCall],
      };

      const result = runResultSchema.safeParse(doc);
      expect(result.success).toBe(true);
      // unknown fields are preserved, not stripped
      expect(
        result.success && (result.data.elements[0] as { input: Record<string, unknown> }).input,
      ).toEqual({
        tool: 'some_future_tool',
        someNewField: 'value',
        count: 3,
      });
    });

    it('rejects a malformed info element (missing message)', () => {
      const doc = {
        schemaVersion: RUN_RESULT_SCHEMA_VERSION,
        sessionId: 'sess-1',
        status: 'success',
        exitCode: 0,
        response: 'done',
        elements: [{ id: 'info-bad', type: CHAT_ELEMENT_TYPES.INFO, timestamp: 6 }],
      };

      expect(runResultSchema.safeParse(doc).success).toBe(false);
    });
  });

  describe('invalid documents', () => {
    const base = {
      schemaVersion: RUN_RESULT_SCHEMA_VERSION,
      sessionId: 'sess-1',
      status: 'success' as const,
      exitCode: 0,
      response: '',
      elements: [],
    };

    it('rejects a status outside the enum', () => {
      const result = runResultSchema.safeParse({ ...base, status: 'partial' });
      expect(result.success).toBe(false);
    });

    it('rejects a genuinely malformed transcript element (missing base fields)', () => {
      // An element missing the required base fields (id/timestamp) fails both
      // the known-element schemas and the unknown-element catch-all.
      const result = runResultSchema.safeParse({
        ...base,
        elements: [{ type: 'unknown' }],
      });
      expect(result.success).toBe(false);
    });

    it('preserves an element with an unknown (future) type', () => {
      const result = runResultSchema.safeParse({
        ...base,
        elements: [{ id: 'x', type: 'future_element', timestamp: 1, extra: 'data' }],
      });
      expect(result.success).toBe(true);
      expect(result.success && result.data.elements[0]).toEqual({
        id: 'x',
        type: 'future_element',
        timestamp: 1,
        extra: 'data',
      });
    });

    it('rejects a known tool with a malformed input (does not fall through the catch-all)', () => {
      // read_file requires `filepath`; a malformed known tool must fail strict
      // validation, not degrade to the unknown-tool pass-through.
      const result = runResultSchema.safeParse({
        ...base,
        elements: [
          {
            id: 'tool-bad',
            type: CHAT_ELEMENT_TYPES.TOOL,
            name: 'read_file',
            input: { tool: 'read_file' },
            state: { type: 'success', output: 'x' },
            timestamp: 1,
          },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('rejects a tool call with an unknown state type', () => {
      const result = runResultSchema.safeParse({
        ...base,
        elements: [{ ...successToolCall, state: { type: 'pending' } }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects an error status without a populated error', () => {
      const result = runResultSchema.safeParse({ ...base, status: 'error', exitCode: 1 });
      expect(result.success).toBe(false);
    });

    it('strips a stray error field on a success document', () => {
      // The discriminated union's `success` variant has no `error` field, so an
      // accidental `error` is dropped rather than carried — `success` documents
      // can never surface an error to consumers.
      const result = runResultSchema.safeParse({ ...base, error: 'should not be here' });
      expect(result.success).toBe(true);
      expect(result.success && 'error' in result.data).toBe(false);
    });

    it('rejects a negative exitCode', () => {
      const result = runResultSchema.safeParse({ ...base, exitCode: -1 });
      expect(result.success).toBe(false);
    });

    it('rejects a non-integer exitCode', () => {
      const result = runResultSchema.safeParse({ ...base, exitCode: 1.5 });
      expect(result.success).toBe(false);
    });

    it('rejects a mismatched schemaVersion', () => {
      const result = runResultSchema.safeParse({ ...base, schemaVersion: '0.9' });
      expect(result.success).toBe(false);
    });
  });
});
