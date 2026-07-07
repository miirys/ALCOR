import { fork, ChildProcess } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync, existsSync, readFileSync } from 'fs';

describe('Multi-process file locking', () => {
  let tempDir: string;
  let storageFile: string;

  beforeAll(() => {
    tempDir = join(tmpdir(), `gitlab-lsp-multiprocess-${Date.now()}`);
    storageFile = join(tempDir, '.gitlab', 'storage.json');
  });

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should handle concurrent writes from multiple processes', async () => {
    const numProcesses = 5;
    const writesPerProcess = 20;
    const workerScript = join(__dirname, 'worker.ts');
    const processes: ChildProcess[] = [];
    const promises: Promise<void>[] = [];

    // Spawn multiple processes
    for (let i = 0; i < numProcesses; i++) {
      const promise = new Promise<void>((resolve, reject) => {
        const child = fork(workerScript, [tempDir, i.toString(), writesPerProcess.toString()], {
          execArgv: ['--import', 'tsx', '--conditions=_ts-source'],
          env: {
            ...process.env,
            GITLAB_LSP_STORAGE_DIR: tempDir,
          },
        });

        child.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Process ${i} exited with code ${code}`));
        });

        child.on('error', reject);
        processes.push(child);
      });

      promises.push(promise);
    }

    await Promise.all(promises);

    // Verify file integrity
    const content = readFileSync(storageFile, 'utf8');
    expect(() => JSON.parse(content)).not.toThrow();

    // Verify that all processes wrote to their own keys
    const data = JSON.parse(content);
    expect(Object.keys(data).length).toBe(numProcesses);

    // Verify each process has its own key with the final value
    for (let i = 0; i < numProcesses; i++) {
      const processKey = `process-${i}:data`;
      expect(data[processKey]).toBeDefined();

      const processValue = data[processKey];
      expect(processValue.processId).toBe(i);
      expect(processValue.totalWrites).toBe(writesPerProcess);
      expect(processValue.currentWrite).toBe(writesPerProcess); // Should be the last write
      expect(processValue.completed).toBe(true);
    }
  }, 60000);
});
