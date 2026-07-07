import { DefaultPersistentStorage } from '@gitlab-org/persistent-storage';
import { TestLogger } from '@gitlab-org/logging';

if (require.main === module) {
  runWorker();
}

async function runWorker() {
  const [, , tempDir, processId, numWrites] = process.argv;

  if (!tempDir || !processId || !numWrites) {
    console.error('Usage: worker.ts <tempDir> <processId> <numWrites>');
    process.exit(1);
  }

  if (!tempDir.includes('gitlab-lsp-multiprocess-')) {
    console.error('SAFETY: Expected temp directory with test marker');
    process.exit(1);
  }

  // Set environment variable - storage class will use this
  process.env.GITLAB_LSP_STORAGE_DIR = tempDir;

  const mockLogger = new TestLogger();

  let storage: DefaultPersistentStorage | null = null;

  try {
    storage = new DefaultPersistentStorage(mockLogger);

    const writes = parseInt(numWrites, 10);

    for (let i = 0; i < writes; i++) {
      // Each process writes to its own key
      const key = `process-${processId}:data`;
      const value = {
        processId: parseInt(processId),
        totalWrites: writes,
        currentWrite: i + 1,
        completed: i === writes - 1,
      };
      await storage.set(key, value);
      await new Promise<void>((resolve) => setTimeout(resolve, Math.random() * 10));
    }

    console.log(`Process ${processId} completed ${writes} writes successfully`);
  } catch (error) {
    console.error(`Process ${processId} error:`, error);
    process.exit(1);
  } finally {
    if (storage) {
      storage.close();
    }
    process.exit(0);
  }
}
