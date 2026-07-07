import { describe, it, expect, beforeEach } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { DefaultHookExecutor } from './hook_executor';

describe('DefaultHookExecutor', () => {
  let executor: DefaultHookExecutor;

  beforeEach(() => {
    executor = new DefaultHookExecutor(new TestLogger());
  });

  describe('executeHook', () => {
    describe('when hook exits 0 with valid JSON stdout', () => {
      it('returns parsed output', async () => {
        const result = await executor.executeHook(
          'echo \'{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"hello"}}\'',
          '{}',
          {},
          undefined,
          process.cwd(),
        );

        expect(result.exitCode).toBe(0);
        expect(result.parsedOutput).toEqual({
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: 'hello',
          },
        });
        expect(result.timedOut).toBe(false);
      });
    });

    describe('when hook exits 0 with empty stdout', () => {
      it('returns null parsedOutput', async () => {
        const result = await executor.executeHook('true', '{}', {}, undefined, process.cwd());

        expect(result.exitCode).toBe(0);
        expect(result.parsedOutput).toBeNull();
      });
    });

    describe('when hook exits 2 with stderr', () => {
      it('returns exit code 2 and stderr', async () => {
        const result = await executor.executeHook(
          'echo "BLOCKED: dangerous" >&2; exit 2',
          '{}',
          {},
          undefined,
          process.cwd(),
        );

        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('BLOCKED: dangerous');
      });
    });

    describe('when hook receives stdin JSON', () => {
      it('passes stdin to the hook process', async () => {
        const stdinJson = JSON.stringify({ session_id: 's1', source: 'startup' });
        const result = await executor.executeHook(
          "node -e \"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).source))\"",
          stdinJson,
          {},
          undefined,
          process.cwd(),
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe('startup');
      });
    });

    describe('when hook receives environment variables', () => {
      it('sets environment variables for the hook process', async () => {
        const result = await executor.executeHook(
          'echo "$DUO_SESSION_ID"',
          '{}',
          { DUO_SESSION_ID: 'test-session' },
          undefined,
          process.cwd(),
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe('test-session');
      });
    });

    describe('when sensitive environment variables are set', () => {
      const sensitiveVars = ['CI_JOB_TOKEN', 'GITLAB_OAUTH_TOKEN', 'DUO_WORKFLOW_SERVICE_TOKEN'];

      it.each(sensitiveVars)('does not pass %s to the hook process', async (varName) => {
        const original = process.env[varName];
        process.env[varName] = 'secret-value';
        try {
          const result = await executor.executeHook(
            `echo "$${varName}"`,
            '{}',
            {},
            undefined,
            process.cwd(),
          );

          expect(result.exitCode).toBe(0);
          expect(result.stdout.trim()).toBe('');
        } finally {
          if (original === undefined) {
            delete process.env[varName];
          } else {
            process.env[varName] = original;
          }
        }
      });
    });

    describe('when hook output exceeds the size limit', () => {
      it('truncates stdout', async () => {
        // Generate output that exceeds 1MB
        const result = await executor.executeHook(
          'dd if=/dev/zero bs=1024 count=1100 2>/dev/null | tr "\\0" "a"',
          '{}',
          {},
          undefined,
          process.cwd(),
        );

        expect(result.exitCode).toBe(0);
        // Should be capped around 1MB, not the full 1100KB
        expect(result.stdout.length).toBeLessThanOrEqual(1024 * 1024 + 65536); // allow some buffer for chunk overshoot
      });
    });

    describe('when hook times out', () => {
      it('returns timedOut: true', async () => {
        const result = await executor.executeHook(
          'sleep 30',
          '{}',
          {},
          100, // 100ms timeout
          process.cwd(),
        );

        expect(result.timedOut).toBe(true);
      }, 15000);
    });

    describe('when hook outputs invalid JSON', () => {
      it('returns null parsedOutput', async () => {
        const result = await executor.executeHook(
          'echo "not json"',
          '{}',
          {},
          undefined,
          process.cwd(),
        );

        expect(result.exitCode).toBe(0);
        expect(result.parsedOutput).toBeNull();
      });
    });

    describe('when envVars override filtered variables', () => {
      it('allows explicit envVars to set values that would otherwise be filtered', async () => {
        const original = process.env.CI_JOB_TOKEN;
        process.env.CI_JOB_TOKEN = 'should-be-filtered';
        try {
          const result = await executor.executeHook(
            'echo "$CI_JOB_TOKEN"',
            '{}',
            { CI_JOB_TOKEN: 'explicitly-set' },
            undefined,
            process.cwd(),
          );

          expect(result.exitCode).toBe(0);
          expect(result.stdout.trim()).toBe('explicitly-set');
        } finally {
          if (original === undefined) {
            delete process.env.CI_JOB_TOKEN;
          } else {
            process.env.CI_JOB_TOKEN = original;
          }
        }
      });
    });

    describe('when hook command does not exist', () => {
      it('returns non-zero exit code without throwing', async () => {
        const result = await executor.executeHook(
          '/nonexistent/command',
          '{}',
          {},
          undefined,
          process.cwd(),
        );

        expect(result.exitCode).not.toBe(0);
      });
    });

    describe('when dispose is called during execution', () => {
      it('kills active hook processes', async () => {
        // Start a long-running hook
        const hookPromise = executor.executeHook('sleep 30', '{}', {}, undefined, process.cwd());

        // Give the process time to start
        await new Promise((resolve) => {
          setTimeout(resolve, 100);
        });

        // Dispose should kill the process
        executor.dispose();

        const result = await hookPromise;
        // Process was killed, so it shouldn't have exited cleanly
        expect(result.exitCode).not.toBe(0);
      }, 10000);
    });

    describe('when running multiple hooks in parallel', () => {
      it('executes all hooks concurrently', async () => {
        const start = Date.now();
        const results = await Promise.all([
          executor.executeHook('sleep 0.1 && echo "a"', '{}', {}, undefined, process.cwd()),
          executor.executeHook('sleep 0.1 && echo "b"', '{}', {}, undefined, process.cwd()),
          executor.executeHook('sleep 0.1 && echo "c"', '{}', {}, undefined, process.cwd()),
        ]);
        const elapsed = Date.now() - start;

        expect(results).toHaveLength(3);
        results.forEach((r) => expect(r.exitCode).toBe(0));
        // Parallel execution should take ~100ms, not ~300ms
        expect(elapsed).toBeLessThan(500);
      }, 10000);
    });
  });
});
