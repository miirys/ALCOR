/* eslint-disable no-console */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import PQueue from 'p-queue';
import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { LogWriter } from '@gitlab-org/logging';
import { doNotAwait } from '@gitlab-org/core';
import { getAppName } from '@gitlab-org/tui';
import { ExitHandler } from '../../utils/exit';
import { getCliLogDir } from './utils';
import { pruneOldLogFiles } from './last_log';

@Implements(LogWriter)
@Service({
  dependencies: [ExitHandler],
  lifetime: ServiceLifetime.Singleton,
})
export class CliFileLogWriter implements LogWriter {
  readonly #logFilePath?: string;

  readonly #writeQueue = new PQueue({ concurrency: 1 });

  #exitHandler?: ExitHandler;

  constructor(exitHandler?: ExitHandler) {
    this.#exitHandler = exitHandler;
    this.#logFilePath = this.#createLogFile();
    setImmediate(() => pruneOldLogFiles()); // run on next tick, don't block initialisation
  }

  write(msg: string): void {
    if (!this.#logFilePath) {
      console.error(msg);
      return;
    }

    const logFilePath = this.#logFilePath;
    doNotAwait(
      this.#writeQueue.add(async () => {
        try {
          await appendFile(logFilePath, `${msg}\n`);
        } catch (error) {
          console.error(`Failed to write to log file: ${logFilePath}`, error);
          console.error(msg);
        }
      }),
    );
  }

  /** example file name: duo-cli-log-2025-09-16T06-36-31-gitlab-lsp-packages-cli.log */
  #getLogFileName(): string {
    const cwdSegments = process.cwd().split(sep).slice(-3);
    // Strip characters that are illegal in file names (notably the colon in a
    // Windows drive letter like `C:`), otherwise the file create/write fails
    // and logging silently falls back to stderr.
    const cwdPart = cwdSegments
      .join('-')
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const sessionStartTime = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `duo-cli-log-${sessionStartTime}-${cwdPart}.log`;
  }

  #createLogFile(): string | undefined {
    try {
      const logDir = getCliLogDir();

      // Ensure the directory exists
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }

      const logFilePath = join(logDir, this.#getLogFileName());

      writeFileSync(logFilePath, '');
      return logFilePath;
    } catch (error) {
      console.error('Failed to create log file. Logs will be printed to stderr.', error);
      return undefined;
    }
  }

  dispose(): void {
    const exitCode = this.#exitHandler?.exitCode;
    if (exitCode !== undefined && exitCode !== 0 && this.#logFilePath) {
      // Leading \n: after TUI unmount the cursor can land at the end of the
      // last rendered line, so without it this hint glues onto the TUI bar.
      console.error(`\nLog: ${this.#logFilePath} (run '${getAppName()} log last' to open)`);
    }
  }

  flush(): Promise<void> {
    return this.#writeQueue.onIdle();
  }
}
