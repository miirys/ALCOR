import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import type { HookConfigLoader } from './hook_config_loader';
import type { HookExecutor } from './hook_executor';
import type { HookResult, HooksConfig } from './types';
import { DefaultHookService } from './hook_service';

describe('DefaultHookService', () => {
  let service: DefaultHookService;
  let mockConfigLoader: HookConfigLoader;
  let mockExecutor: HookExecutor;

  const makeResult = (overrides: Partial<HookResult> = {}): HookResult => ({
    exitCode: 0,
    stdout: '',
    stderr: '',
    parsedOutput: null,
    timedOut: false,
    ...overrides,
  });

  beforeEach(() => {
    mockConfigLoader = createFakePartial<HookConfigLoader>({
      load: jest.fn<HookConfigLoader['load']>().mockResolvedValue({ hooks: {} }),
    });

    mockExecutor = createFakePartial<HookExecutor>({
      executeHook: jest.fn<HookExecutor['executeHook']>().mockResolvedValue(makeResult()),
    });

    service = new DefaultHookService(new TestLogger(), mockConfigLoader, mockExecutor);
  });

  describe('runSessionStart', () => {
    describe('when no SessionStart hooks are configured', () => {
      it('returns empty result', async () => {
        const result = await service.runSessionStart('s1', '/cwd', '/transcript', 'startup');
        expect(result).toEqual({});
      });

      it('does not execute any hooks', async () => {
        await service.runSessionStart('s1', '/cwd', '/transcript', 'startup');
        expect(mockExecutor.executeHook).not.toHaveBeenCalled();
      });
    });

    describe('when hook returns additionalContext via JSON', () => {
      beforeEach(() => {
        const config: HooksConfig = {
          hooks: {
            SessionStart: [{ hooks: [{ type: 'command', command: 'project-context.sh' }] }],
          },
        };
        jest.mocked(mockConfigLoader.load).mockResolvedValue(config);
        jest.mocked(mockExecutor.executeHook).mockResolvedValue(
          makeResult({
            parsedOutput: {
              hookSpecificOutput: {
                hookEventName: 'SessionStart',
                additionalContext: 'You are on branch main',
              },
            },
          }),
        );
      });

      it('returns additionalContext', async () => {
        const result = await service.runSessionStart('s1', '/cwd', '/transcript', 'startup');
        expect(result.additionalContext).toBe('You are on branch main');
      });
    });

    describe('when hook returns plain text stdout', () => {
      beforeEach(() => {
        const config: HooksConfig = {
          hooks: {
            SessionStart: [{ hooks: [{ type: 'command', command: 'echo context' }] }],
          },
        };
        jest.mocked(mockConfigLoader.load).mockResolvedValue(config);
        jest
          .mocked(mockExecutor.executeHook)
          .mockResolvedValue(makeResult({ stdout: 'Plain text context from hook' }));
      });

      it('treats plain text stdout as additionalContext', async () => {
        const result = await service.runSessionStart('s1', '/cwd', '/transcript', 'startup');
        expect(result.additionalContext).toBe('Plain text context from hook');
      });
    });

    describe('when hook exits 2 (non-blocking error)', () => {
      beforeEach(() => {
        const config: HooksConfig = {
          hooks: {
            SessionStart: [{ hooks: [{ type: 'command', command: 'fail.sh' }] }],
          },
        };
        jest.mocked(mockConfigLoader.load).mockResolvedValue(config);
        jest
          .mocked(mockExecutor.executeHook)
          .mockResolvedValue(makeResult({ exitCode: 2, stderr: 'Hook error' }));
      });

      it('returns empty result (non-blocking)', async () => {
        const result = await service.runSessionStart('s1', '/cwd', '/transcript', 'startup');
        expect(result.additionalContext).toBeUndefined();
      });
    });

    describe('when matcher filters by source', () => {
      beforeEach(() => {
        const config: HooksConfig = {
          hooks: {
            SessionStart: [
              { matcher: 'startup', hooks: [{ type: 'command', command: 'startup-only.sh' }] },
            ],
          },
        };
        jest.mocked(mockConfigLoader.load).mockResolvedValue(config);
      });

      it('runs hook when source matches', async () => {
        await service.runSessionStart('s1', '/cwd', '/transcript', 'startup');
        expect(mockExecutor.executeHook).toHaveBeenCalled();
      });

      it('does not run hook when source does not match', async () => {
        await service.runSessionStart('s1', '/cwd', '/transcript', 'resume');
        expect(mockExecutor.executeHook).not.toHaveBeenCalled();
      });
    });

    describe('when hook passes input fields', () => {
      beforeEach(() => {
        const config: HooksConfig = {
          hooks: {
            SessionStart: [{ hooks: [{ type: 'command', command: 'context.sh' }] }],
          },
        };
        jest.mocked(mockConfigLoader.load).mockResolvedValue(config);
      });

      it('includes session_id, cwd, transcript_path, and source in stdin JSON', async () => {
        await service.runSessionStart('s1', '/cwd', '/transcript', 'startup');
        const stdinJson = jest.mocked(mockExecutor.executeHook).mock.calls[0][1];
        const parsed = JSON.parse(stdinJson);
        expect(parsed).toEqual(
          expect.objectContaining({
            session_id: 's1',
            cwd: '/cwd',
            transcript_path: '/transcript',
            hook_event_name: 'SessionStart',
            source: 'startup',
          }),
        );
      });

      it('passes cwd to the executor', async () => {
        await service.runSessionStart('s1', '/cwd', '/transcript', 'startup');
        const cwdArg = jest.mocked(mockExecutor.executeHook).mock.calls[0][4];
        expect(cwdArg).toBe('/cwd');
      });

      it('passes dual-prefixed env vars', async () => {
        await service.runSessionStart('s1', '/cwd', '/transcript', 'startup');
        const envVars = jest.mocked(mockExecutor.executeHook).mock.calls[0][2];
        expect(envVars).toEqual(
          expect.objectContaining({
            CLAUDE_SESSION_ID: 's1',
            DUO_SESSION_ID: 's1',
            CLAUDE_PROJECT_DIR: '/cwd',
            DUO_PROJECT_DIR: '/cwd',
            CLAUDE_ENV_FILE: '',
            DUO_ENV_FILE: '',
          }),
        );
      });
    });

    describe('when config loader receives cwd', () => {
      beforeEach(() => {
        jest.mocked(mockConfigLoader.load).mockResolvedValue({ hooks: {} });
      });

      it('passes cwd and options to the config loader', async () => {
        await service.runSessionStart('s1', '/my/project', '', 'startup', {
          enableProjectHooks: true,
        });
        expect(mockConfigLoader.load).toHaveBeenCalledWith('/my/project', {
          enableProjectHooks: true,
        });
      });
    });

    describe('when multiple hooks return context', () => {
      beforeEach(() => {
        const config: HooksConfig = {
          hooks: {
            SessionStart: [
              {
                hooks: [
                  { type: 'command', command: 'hook1.sh' },
                  { type: 'command', command: 'hook2.sh' },
                ],
              },
            ],
          },
        };
        jest.mocked(mockConfigLoader.load).mockResolvedValue(config);
        jest
          .mocked(mockExecutor.executeHook)
          .mockResolvedValueOnce(makeResult({ stdout: 'Context from hook 1' }))
          .mockResolvedValueOnce(makeResult({ stdout: 'Context from hook 2' }));
      });

      it('concatenates context from all hooks', async () => {
        const result = await service.runSessionStart('s1', '/cwd', '', 'startup');
        expect(result.additionalContext).toBe('Context from hook 1\nContext from hook 2');
      });
    });

    describe('when hook times out', () => {
      beforeEach(() => {
        const config: HooksConfig = {
          hooks: {
            SessionStart: [{ hooks: [{ type: 'command', command: 'slow.sh' }] }],
          },
        };
        jest.mocked(mockConfigLoader.load).mockResolvedValue(config);
        jest.mocked(mockExecutor.executeHook).mockResolvedValue(makeResult({ timedOut: true }));
      });

      it('ignores timed-out hooks and returns empty result', async () => {
        const result = await service.runSessionStart('s1', '/cwd', '', 'startup');
        expect(result.additionalContext).toBeUndefined();
      });
    });
  });
});
