import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import type { ChatElement } from '@gitlab-org/tui';
import type { Session } from '../../sessions';
import { RunResultWriter } from './run_result_writer';

describe('RunResultWriter', () => {
  let logger: TestLogger;
  let writer: RunResultWriter;
  let stdoutSpy: jest.SpiedFunction<typeof process.stdout.write>;

  const buildSession = (elements: ChatElement[]) =>
    createFakePartial<Session>({ sessionId: 'session-1', elements });

  const writtenDocument = () => {
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    return JSON.parse(stdoutSpy.mock.calls[0][0] as string);
  };

  beforeEach(() => {
    logger = new TestLogger();
    writer = new RunResultWriter(logger);
    stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((() => true) as typeof process.stdout.write);
  });

  afterEach(() => stdoutSpy.mockRestore());

  const assistantMessages = (...contents: string[]): ChatElement[] =>
    contents.map((content, i) => ({
      id: `m${i}`,
      type: 'message',
      role: 'assistant',
      content,
      timestamp: i,
      isComplete: true,
    }));

  it('emits a success document with the last completed assistant message as response', () => {
    writer.writeJson(buildSession(assistantMessages('old', 'final')), {
      status: 'success',
      exitCode: 0,
    });

    const document = writtenDocument();
    expect(document.status).toBe('success');
    expect(document.response).toBe('final');
    expect(document.error).toBeUndefined();
  });

  it('writes the final response as plain text', () => {
    writer.writeText(buildSession(assistantMessages('old', 'final')));

    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    expect(stdoutSpy.mock.calls[0][0]).toBe('final\n');
  });

  it('writes nothing as text when there is no completed response', () => {
    writer.writeText(buildSession([]));

    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('emits an error document carrying the provided error', () => {
    writer.writeJson(buildSession([]), { status: 'error', exitCode: 1, error: 'boom' });

    const document = writtenDocument();
    expect(document.status).toBe('error');
    expect(document.exitCode).toBe(1);
    expect(document.error).toBe('boom');
    expect(document.response).toBe('');
  });

  it('writes nothing and logs when the document fails schema validation', () => {
    const session = buildSession([
      {
        id: 'bad',
        type: 'tool',
        name: 'read_file',
        input: { tool: 'read_file', filepath: 'f.ts' },
        state: { type: 'pending' },
        timestamp: 1,
      } as unknown as ChatElement,
    ]);

    writer.writeJson(session, { status: 'success', exitCode: 0 });

    expect(stdoutSpy).not.toHaveBeenCalled();
    const errors = logger.errorLogs.map((log) => log.message ?? '');
    expect(errors.some((m) => m.includes('Failed to emit JSON result document'))).toBe(true);
  });
});
