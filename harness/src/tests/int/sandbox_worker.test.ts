// Mock sandbox-runtime to avoid ESM import.meta syntax error in Jest CJS mode.
// This test only needs worker_rpc types, not the runtime itself.
jest.mock('@anthropic-ai/sandbox-runtime', () => ({}));

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-jsonrpc/node';
import {
  ExecuteActionRequest,
  CancelActionNotification,
  WorkerReadyNotification,
  WorkerShutdownNotification,
  type WorkerActionRequest,
  type WorkerActionResponse,
} from '@gitlab-org/sandbox';

const WORKER_SCRIPT = require.resolve('../../../packages/lib_sandbox/src/worker/worker_main.ts');
const TSX_BIN = require.resolve('../../../node_modules/.bin/tsx');
const WORKER_READY_TIMEOUT = 15_000;

function makeRequest(action: Record<string, unknown>, workspacePath: string): WorkerActionRequest {
  return {
    action,
    context: {
      workspaceFolderPath: workspacePath,
      workflowId: 'test-workflow',
      gitlabBaseUrl: 'https://gitlab.example.com',
      gitlabToken: 'test-token',
    },
  };
}

function spawnWorker(workspacePath: string): {
  process: ChildProcess;
  connection: MessageConnection;
  ready: Promise<void>;
} {
  const workerProcess = spawn(TSX_BIN, ['--conditions', '_ts-source', WORKER_SCRIPT], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: workspacePath,
    env: { ...process.env, GITLAB_SANDBOX_WORKER: 'true' },
  });

  const connection = createMessageConnection(
    new StreamMessageReader(workerProcess.stdout!),
    new StreamMessageWriter(workerProcess.stdin!),
  );

  const ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Worker did not signal ready within timeout'));
    }, WORKER_READY_TIMEOUT);

    connection.onNotification(WorkerReadyNotification.methodName, () => {
      clearTimeout(timeout);
      resolve();
    });

    workerProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    workerProcess.on('exit', (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`Worker exited before ready: code=${code}, signal=${signal}`));
    });
  });

  connection.listen();

  return { process: workerProcess, connection, ready };
}

async function executeAction(
  connection: MessageConnection,
  action: Record<string, unknown>,
  workspacePath: string,
): Promise<WorkerActionResponse> {
  return connection.sendRequest(
    ExecuteActionRequest.methodName,
    makeRequest(action, workspacePath),
  );
}

describe('Sandbox worker integration', () => {
  let worker: ChildProcess;
  let connection: MessageConnection;
  let workspacePath: string;

  beforeAll(async () => {
    // Create a temp workspace with a git repo so action handlers work
    workspacePath = mkdtempSync(join(tmpdir(), 'sandbox-worker-test-'));
    const { execSync } = require('node:child_process');
    execSync('git init', { cwd: workspacePath, stdio: 'pipe' });
    execSync('git commit --allow-empty -m "init"', {
      cwd: workspacePath,
      stdio: 'pipe',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@test.com',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 'test@test.com',
      },
    });

    const spawned = spawnWorker(workspacePath);
    worker = spawned.process;
    connection = spawned.connection;
    await spawned.ready;
  });

  afterAll(async () => {
    try {
      connection.sendNotification(WorkerShutdownNotification.methodName);
      connection.dispose();
    } catch {
      // Worker may already be gone
    }
    // Give worker time to exit gracefully before force-killing
    await new Promise<void>((resolve) => {
      if (!worker || worker.exitCode !== null) return resolve();
      worker.once('exit', () => resolve());
      setTimeout(() => resolve(), 1000);
    });
    if (worker && !worker.killed) {
      worker.kill('SIGTERM');
    }
    rmSync(workspacePath, { recursive: true, force: true });
  });

  it('signals ready on startup', () => {
    // If we got here, beforeAll succeeded — worker signaled ready
    expect(worker.exitCode).toBeNull();
  });

  describe('mkdir', () => {
    it('creates a directory', async () => {
      const result = await executeAction(
        connection,
        { requestID: 'mkdir-1', mkdir: { directory_path: 'test-dir' } },
        workspacePath,
      );
      expect(result).toEqual(
        expect.objectContaining({ response: expect.stringContaining('successfully'), error: '' }),
      );
    });
  });

  describe('write_file', () => {
    it('creates a new file', async () => {
      const result = await executeAction(
        connection,
        {
          requestID: 'write-1',
          runWriteFile: { filepath: 'test-dir/hello.txt', contents: 'line 1\nline 2\nline 3' },
        },
        workspacePath,
      );
      expect(result).toEqual(
        expect.objectContaining({ response: expect.stringContaining('successfully'), error: '' }),
      );

      // Verify file was actually written
      const content = readFileSync(join(workspacePath, 'test-dir/hello.txt'), 'utf-8');
      expect(content).toBe('line 1\nline 2\nline 3');
    });
  });

  describe('read_file', () => {
    it('reads a file', async () => {
      const result = await executeAction(
        connection,
        { requestID: 'read-1', runReadFile: { filepath: 'test-dir/hello.txt' } },
        workspacePath,
      );
      expect(result).toEqual(
        expect.objectContaining({ response: expect.stringContaining('line 1'), error: '' }),
      );
    });
  });

  describe('edit_file', () => {
    it('edits a file', async () => {
      // FileStateTracker requires a read before edit
      await executeAction(
        connection,
        { requestID: 'edit-pre-read', runReadFile: { filepath: 'test-dir/hello.txt' } },
        workspacePath,
      );

      const result = await executeAction(
        connection,
        {
          requestID: 'edit-1',
          runEditFile: {
            filepath: 'test-dir/hello.txt',
            oldString: 'line 2',
            newString: 'modified line 2',
          },
        },
        workspacePath,
      );
      expect(result).toEqual(
        expect.objectContaining({ response: expect.stringContaining('updated'), error: '' }),
      );

      const content = readFileSync(join(workspacePath, 'test-dir/hello.txt'), 'utf-8');
      expect(content).toContain('modified line 2');
    });
  });

  describe('find_files', () => {
    it('finds files by pattern', async () => {
      const result = await executeAction(
        connection,
        { requestID: 'find-1', findFiles: { name_pattern: '*.txt' } },
        workspacePath,
      );
      expect(result).toEqual(
        expect.objectContaining({ response: expect.stringContaining('hello.txt'), error: '' }),
      );
    });
  });

  describe('list_dir', () => {
    it('lists directory contents', async () => {
      const result = await executeAction(
        connection,
        { requestID: 'list-1', listDirectory: { directory: 'test-dir' } },
        workspacePath,
      );
      expect(result).toEqual(
        expect.objectContaining({ response: expect.stringContaining('hello.txt'), error: '' }),
      );
    });
  });

  describe('run_command', () => {
    it('runs a command', async () => {
      const result = await executeAction(
        connection,
        {
          requestID: 'cmd-1',
          runCommand: { program: 'echo', flags: [], arguments: ['hello sandbox'] },
        },
        workspacePath,
      );
      expect(result).toEqual(
        expect.objectContaining({
          response: expect.stringMatching(/Exit code: 0\nhello sandbox/),
          error: '',
        }),
      );
    });
  });

  describe('run_shell_command', () => {
    it('runs a shell command', async () => {
      const result = await executeAction(
        connection,
        { requestID: 'shell-1', runShellCommand: { command: 'echo "shell works"' } },
        workspacePath,
      );
      expect(result).toEqual(
        expect.objectContaining({
          response: expect.stringMatching(/Exit code: 0\nshell works/),
          error: '',
        }),
      );
    });
  });

  describe('grep', () => {
    it('searches file contents', async () => {
      const result = await executeAction(
        connection,
        {
          requestID: 'grep-1',
          grep: { pattern: 'modified', search_directory: '.', case_insensitive: false },
        },
        workspacePath,
      );
      expect(result).toEqual(
        expect.objectContaining({ response: expect.stringContaining('modified'), error: '' }),
      );
    });
  });

  describe('cancel', () => {
    it('cancels an in-flight action', async () => {
      const request = makeRequest(
        { requestID: 'cancel-1', runCommand: { program: 'sleep', flags: [], arguments: ['60'] } },
        workspacePath,
      );

      const resultPromise = connection.sendRequest(ExecuteActionRequest.methodName, request);

      // Give the command a moment to start, then cancel
      await new Promise((resolve) => setTimeout(resolve, 200));
      connection.sendNotification(CancelActionNotification.methodName, {
        requestID: 'cancel-1',
      });

      const result = await resultPromise;
      expect(result).toBeDefined();
    });
  });

  describe('unsupported action', () => {
    it('returns error for unknown action type', async () => {
      const result = await executeAction(connection, { requestID: 'unknown-1' }, workspacePath);
      expect(result).toEqual(
        expect.objectContaining({ response: '', error: expect.stringContaining('not supported') }),
      );
    });
  });
});
