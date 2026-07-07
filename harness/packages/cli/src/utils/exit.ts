import type { ServiceProvider } from '@gitlab/needle';
import { Logger, LogWriter, withPrefix } from '@gitlab-org/logging';

type CleanupFn = () => void | Promise<void>;
type ResumeFn = () => void;

const SHUTDOWN_TIMEOUT_MS = 5000;

/**
 * Centralized exit handler for the CLI application.
 *
 * Ensures graceful shutdown by coordinating cleanup across TUI and DI layers.
 * All exit paths (signals, programmatic exits) flow through this handler to
 * guarantee consistent cleanup order: TUI first (terminal state), then DI
 * (disposable services etc). Finally, we flush any pending writes to the log file.
 */
export class ExitHandler {
  #tuiCleanup?: CleanupFn;

  #container?: ServiceProvider;

  #logger?: Logger;

  #logWriter?: LogWriter;

  #isShuttingDown = false;

  #exitCode?: number;

  #tuiResume?: ResumeFn;

  constructor() {
    process.on('SIGINT', () => this.exit(130, { signal: 'SIGINT' }));
    process.on('SIGTERM', () => this.exit(143, { signal: 'SIGTERM' }));
    process.on('SIGCONT', () => this.#resume());
  }

  setTuiCleanup(fn: CleanupFn): void {
    this.#tuiCleanup = fn;
  }

  // Resume is centralized here, not in the TUI's SuspendController, so the SIGCONT handler can
  // honour #isShuttingDown and avoid re-applying terminal modes on a process that is exiting.
  setTuiResume(fn: ResumeFn): void {
    this.#tuiResume = fn;
  }

  #resume(): void {
    if (this.#isShuttingDown || !this.#tuiResume) {
      return;
    }
    try {
      this.#tuiResume();
    } catch (err) {
      this.#logger?.error('TUI resume failed', err);
    }
  }

  /** The exit code for the current shutdown, available during container disposal. */
  get exitCode(): number | undefined {
    return this.#exitCode;
  }

  setDiContainer(container: ServiceProvider): void {
    this.#container = container;
    this.#logger = withPrefix(container.getRequiredService(Logger), '[CliExitHandler]');
    this.#logWriter = container.getRequiredService(LogWriter);
  }

  async exit(code: number, options?: { signal?: string; finalMessage?: string }): Promise<never> {
    const { signal, finalMessage } = options ?? {};

    if (this.#isShuttingDown) {
      return new Promise(() => {});
    }
    this.#isShuttingDown = true;

    // Brief delay to allow UI to render any final error state
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    if (signal) {
      this.#logger?.info(`Received ${signal}, shutting down gracefully...`);
    } else {
      this.#logger?.info('Shutting down gracefully...');
    }

    const forceExit = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error('Cleanup timeout exceeded, forcing exit');
      process.exit(code);
    }, SHUTDOWN_TIMEOUT_MS);

    if (this.#tuiCleanup) {
      try {
        await this.#tuiCleanup();
      } catch (err) {
        this.#logger?.error('TUI cleanup failed', err);
      }
    }

    // After #tuiCleanup() so this isn't clobbered by Ink's final stdout repaint.
    if (finalMessage) {
      process.stderr.write(`${finalMessage}\n`);
    }

    // Set exit code before disposal so services can read it in their dispose().
    this.#exitCode = code;

    if (this.#container) {
      try {
        await this.#container.dispose();
      } catch (err) {
        this.#logger?.error('DI cleanup failed', err);
      }
    }

    this.#logger?.info('Shutdown complete, good bye :)');

    await this.#logWriter?.flush?.();

    clearTimeout(forceExit);
    return process.exit(code);
  }
}
