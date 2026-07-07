import { execFileSync } from 'child_process';
import { getCompiledBinaryPath, createTestEnv, assertTestToken, getTestToken } from './test_utils';
import { recordedTest } from './recorded_test';

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

function runCli(
  args: string[],
  env: Record<string, string> = {},
): { stdout: string; stderr: string; status: number } {
  const binaryPath = getCompiledBinaryPath();

  try {
    const stdout = execFileSync(binaryPath, ['--model', ANTHROPIC_MODEL, ...args], {
      encoding: 'utf-8',
      timeout: 60000,
      killSignal: 'SIGKILL',
      env: { ...process.env, ...createTestEnv(env) },
    });
    return { stdout, stderr: '', status: 0 };
  } catch (error: unknown) {
    const e = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      status: e.status ?? 1,
    };
  }
}

describe('duo direct E2E', () => {
  beforeAll(() => {
    assertTestToken();
  });

  describe('when running `direct` TUI', () => {
    const ctx = recordedTest();

    it('should show welcome and respond to greeting', async () => {
      const chat = ctx.launchChat({
        subcommand: 'direct',
        cliOptions: { gitlabAuthToken: getTestToken(), model: ANTHROPIC_MODEL },
      });

      await chat.waitForWelcomeMessage();

      await chat.sendMessage('hi');
      await chat.waitForDuoResponse();
    }, 60000);
  });

  describe('when running `direct run` with a goal', () => {
    it('sends a prompt and receives a response from the LLM', () => {
      const result = runCli(
        [
          'direct',
          'run',
          '--output-format',
          'json',
          '--goal',
          'Respond with exactly: DIRECT_TEST_OK',
        ],
        {
          GITLAB_TOKEN: getTestToken(),
        },
      );

      const allOutput = result.stdout + result.stderr;

      expect(allOutput).not.toContain('uncaught exception');

      // In json mode the result document carries the assistant message element
      // whose content is the expected response.
      expect(allOutput).toContain('"content": "DIRECT_TEST_OK"');

      expect(result.status).toBe(0);
    }, 60000);
  });

  describe('when running `direct --help`', () => {
    it('shows direct command help', () => {
      const result = runCli(['direct', '--help']);

      expect(result.stdout).toContain('Use the direct Anthropic backend');
      expect(result.stdout).toContain('run');
    });
  });

  describe('when running `direct run --help`', () => {
    it('shows run subcommand help', () => {
      const result = runCli(['direct', 'run', '--help']);

      expect(result.stdout).toContain('Run a workflow in non-interactive / headless mode');
      expect(result.stdout).toContain('--goal');
      expect(result.stdout).toContain('--model');
    });
  });
});
