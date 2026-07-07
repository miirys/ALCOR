import { execSync, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { ChatPage, type ChatPageLaunchOptions } from './pages/chat_page';

export interface RecordedTestContext {
  launchChat(options?: Omit<ChatPageLaunchOptions, 'castFile' | 'recordingTitle'>): ChatPage;
}

function shellEscape(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Upload a .cast recording to asciinema.org. Returns the URL on success or
 * `undefined` on failure. Never throws — safe to call from afterEach so an
 * unreachable asciinema service does not cause additional test failures.
 */
export function uploadRecording(castFile: string): string | undefined {
  if (!existsSync(castFile)) {
    // eslint-disable-next-line no-console
    console.warn(`[recorded_test] No .cast file found at ${castFile} — skipping upload.`);
    return undefined;
  }

  // Retry upload up to 3 times with a delay. After tmux kill-session,
  // asciinema may still be finalizing the .cast file (flushing buffers,
  // writing the trailer). Uploading a partially-written file causes a
  // 400 Bad Request from the server.
  const MAX_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 1000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const output = execSync(`asciinema upload --visibility unlisted ${shellEscape(castFile)}`, {
        encoding: 'utf-8',
        timeout: 30_000,
      });
      const url = output.trim().split('\n').pop()?.trim();
      if (url?.startsWith('http')) {
        // eslint-disable-next-line no-console
        console.log(`[recorded_test] Recording uploaded: ${url}`);
        return url;
      }
      // eslint-disable-next-line no-console
      console.log(`[recorded_test] Upload output: ${output}`);
      return undefined;
    } catch (error) {
      if (attempt < MAX_ATTEMPTS) {
        // eslint-disable-next-line no-console
        console.warn(
          `[recorded_test] Upload attempt ${attempt}/${MAX_ATTEMPTS} failed, retrying in ${RETRY_DELAY_MS}ms...`,
        );
        spawnSync('sleep', [String(RETRY_DELAY_MS / 1000)]); // sync sleep
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          `[recorded_test] Upload failed (non-fatal): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
  return undefined;
}

/**
 * Derive the .cast file path for a given test name.
 * Used by both `recordedTest()` and `CliLogEnvironment` to locate
 * the recording without shared mutable state.
 */
export function deriveCastPath(testName: string): string {
  const baseDir = process.env.E2E_ARTIFACTS_DIR || '/tmp/tui-e2e-artifacts';
  const safeName = testName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
  return join(baseDir, safeName, 'recording.cast');
}

/**
 * Convenience wrapper that wires up `beforeEach`/`afterEach` for a test suite
 * so every test is asciinema-recorded and the recording is uploaded on failure.
 *
 * ```ts
 * const ctx = recordedTest();
 * it('works', async () => {
 *   const chat = ctx.launchChat({ cliOptions: { gitlabAuthToken: token } });
 * });
 * ```
 */
export function recordedTest(): RecordedTestContext {
  let castFile: string;
  let testName: string;
  let chat: ChatPage | undefined;

  beforeEach(() => {
    const { currentTestName } = expect.getState();
    if (!currentTestName) throw new Error('recordedTest: currentTestName is not set');
    testName = currentTestName;
    castFile = deriveCastPath(testName);
    chat = undefined;
  });

  afterEach(() => {
    chat?.cleanup();
  });

  return {
    launchChat(options = {}) {
      const c = ChatPage.launch({ ...options, castFile, recordingTitle: testName });
      chat = c;
      return c;
    },
  };
}
