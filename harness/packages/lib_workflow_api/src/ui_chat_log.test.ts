import type { Result } from 'neverthrow';
import type { DuoWorkflowEvent } from './workflow_message_types';
import { extractUiChatLog, type ChatLog } from './ui_chat_log';
import {
  standardFlowUiChatLog,
  developerFlowUiChatLog,
  buildCheckpointFromUiChatLog,
} from './test_fixtures';

function eventWithCheckpoint(checkpoint: string | undefined): DuoWorkflowEvent {
  return { checkpoint } as unknown as DuoWorkflowEvent;
}

function unwrap<T>(result: Result<T, Error>): T {
  if (result.isErr()) throw result.error;
  return result.value;
}

function expectErrorContaining(result: Result<ChatLog[], Error>, fragment: string): void {
  expect(result.isErr()).toBe(true);
  if (result.isErr()) {
    expect(result.error.message).toContain(fragment);
  }
}

describe('extractUiChatLog', () => {
  describe('when there is no checkpoint', () => {
    it('returns an empty array', () => {
      expect(unwrap(extractUiChatLog(eventWithCheckpoint(undefined)))).toEqual([]);
    });
  });

  describe('when the checkpoint is invalid JSON', () => {
    it('returns an error referencing the raw checkpoint', () => {
      expectErrorContaining(
        extractUiChatLog(eventWithCheckpoint('not json {')),
        'Failed to parse a workflow checkpoint',
      );
    });
  });

  describe('when the checkpoint has no ui_chat_log', () => {
    it('returns an empty array', () => {
      const result = extractUiChatLog(eventWithCheckpoint(JSON.stringify({ channel_values: {} })));
      expect(unwrap(result)).toEqual([]);
    });
  });

  describe('when a message fails schema validation', () => {
    it('returns an error pointing at the offending index', () => {
      const checkpoint = buildCheckpointFromUiChatLog([
        { message_type: 'agent' /* missing required fields */ },
      ]);
      expectErrorContaining(
        extractUiChatLog(eventWithCheckpoint(checkpoint)),
        'Failed to validate message at index 0',
      );
    });
  });

  // These cases exercise the exact ui_chat_log shapes captured from live Duo CLI
  // sessions. See test_fixtures.ts for how the snapshots were produced.
  describe('standard flow checkpoint (no --developer flag)', () => {
    const messages = unwrap(
      extractUiChatLog(eventWithCheckpoint(buildCheckpointFromUiChatLog(standardFlowUiChatLog))),
    );

    it('parses the full conversation in order', () => {
      expect(messages.map((m) => m.message_type)).toEqual([
        'user',
        'request',
        'tool',
        'request',
        'request',
        'tool',
        'tool',
        'agent',
      ]);
    });

    it('keeps run_command tool calls with their object tool_response', () => {
      const tool = messages[2];
      if (tool.message_type !== 'tool' || tool.tool_info === null) throw new Error('expected tool');
      expect(tool.tool_info.name).toBe('run_command');
      expect(tool.tool_info.args).toEqual({ command: 'ls -la' });
      expect(typeof tool.tool_info.tool_response).toBe('object');
    });

    it('preserves suggested_patterns on approval requests', () => {
      const request = messages[3];
      if (request.message_type !== 'request') throw new Error('expected request');
      expect(request.tool_info.suggested_patterns).toEqual([
        'cat package.json | grep -E *',
        'cat package.json *',
      ]);
    });

    it('strips backend-only fields that are not part of the schema', () => {
      const agent = messages.at(-1)!;
      expect(agent).not.toHaveProperty('component_name');
      expect(agent).not.toHaveProperty('subsession_id');
    });
  });

  describe('developer flow checkpoint (--developer flag)', () => {
    const messages = unwrap(
      extractUiChatLog(eventWithCheckpoint(buildCheckpointFromUiChatLog(developerFlowUiChatLog))),
    );

    it('parses the full conversation in order', () => {
      expect(messages.map((m) => m.message_type)).toEqual([
        'user',
        'agent',
        'request',
        'tool',
        'tool',
        'agent',
        'tool',
        'agent',
      ]);
    });

    it('keeps string tool_response for auto-run tools', () => {
      const readFileTool = messages[4];
      if (readFileTool.message_type !== 'tool' || readFileTool.tool_info === null) {
        throw new Error('expected tool');
      }
      expect(readFileTool.tool_info.name).toBe('read_file');
      expect(typeof readFileTool.tool_info.tool_response).toBe('string');
    });

    it('strips backend-only fields (component_name, subsession_id)', () => {
      for (const message of messages) {
        expect(message).not.toHaveProperty('component_name');
        expect(message).not.toHaveProperty('subsession_id');
      }
    });
  });
});
