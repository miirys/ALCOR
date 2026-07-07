import { closeSync, openSync, writeSync } from 'node:fs';
import type { ChatElement } from '@gitlab-org/tui';
import { Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import type { Disposable } from '@gitlab-org/disposable';
import { AgentEventType, type RetryAgentEvent } from '../backend/backend';

/**
 * Writes OSC 9;4 escape sequences to update the terminal tab progress indicator.
 * No-op when /dev/tty is unavailable (e.g. running without a terminal).
 */
@Service({ dependencies: [Logger], lifetime: ServiceLifetime.Singleton })
export class TerminalProgressService implements Disposable {
  #ttyHandle: number | undefined;

  #inTmux: boolean;

  #logger: Logger;

  #waitingForInput = false;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[TerminalProgress]');
    this.#inTmux = Boolean(process.env.TMUX);
    this.#initialize();
  }

  #initialize(): void {
    if (!process.stdout.isTTY) {
      this.#logger.debug('Not a TTY environment, skipping terminal progress reporting');
      return;
    }
    try {
      this.#ttyHandle = openSync('/dev/tty', 'w');
    } catch (error) {
      this.#logger.warn('Failed to open /dev/tty for terminal progress reporting', error);
      return;
    }
    this.#logger.info('Terminal progress reporting enabled');
  }

  dispose(): void {
    if (this.#ttyHandle !== undefined) {
      this.#setIdle();
      try {
        closeSync(this.#ttyHandle);
      } catch {
        // fd may already be invalid
      }
      this.#ttyHandle = undefined;
    }
  }

  async *trackStream(
    stream: AsyncGenerator<ChatElement | RetryAgentEvent>,
  ): AsyncGenerator<ChatElement | RetryAgentEvent> {
    this.#waitingForInput = false;
    this.#setBusy();
    let lastElement: ChatElement | undefined;
    let settled = false;

    try {
      for await (const element of stream) {
        yield element;
        if (element.type !== AgentEventType.Retry) {
          lastElement = element;
        }
      }

      settled = true;
      if (lastElement?.type === 'error') {
        this.#setError();
      } else if (lastElement?.type === 'tool' && lastElement.state.type === 'approval_request') {
        this.#setPaused();
      } else {
        this.#setIdle();
      }
    } catch (error) {
      settled = true;
      this.#setError();
      throw error;
    } finally {
      if (!settled) this.#setIdle();
    }
  }

  #setBusy(): void {
    if (this.#waitingForInput) return;
    this.#write('3');
  }

  #setPaused(): void {
    this.#waitingForInput = true;
    this.#write('4;50');
  }

  #setIdle(): void {
    this.#waitingForInput = false;
    this.#write('0');
  }

  #setError(): void {
    this.#waitingForInput = false;
    this.#write('2');
  }

  #write(code: string): void {
    if (this.#ttyHandle === undefined) return;
    try {
      const payload = `9;4;${code}`;
      const esc = this.#inTmux
        ? `\x1bPtmux;\x1b\x1b]${payload}\x1b\x1b\\\x1b\\`
        : `\x1b]${payload}\x1b\\`;
      writeSync(this.#ttyHandle, esc);
    } catch {
      this.#logger.warn('Failed to write terminal progress, disabling');
      this.#ttyHandle = undefined;
    }
  }
}
