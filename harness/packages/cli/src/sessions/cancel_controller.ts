import type { Logger } from '@gitlab-org/logging';
import { withPrefix } from '@gitlab-org/logging';

/**
 * cancel/force-stop orchestrator for a single ChatSession turn.
 *
 * why a separate class: cancellation touches four independent subsystems
 * (fetch abort, backend workflow cancel, ws close, tool child kill) plus a
 * synthetic ui event. keeping it in one place makes the teardown testable in
 * isolation and prevents the current bug where only step 1 (fetch abort) ran.
 */
export interface CancelableBackend {
  cancelActiveWorkflow(workflowId: string, reason: string): Promise<void>;
}
export interface CancelableWs {
  close(code?: number, reason?: string): void;
  readyState: number;
  OPEN: number;
}
export interface CancelableToolExecutor {
  killActive(signal: 'cancel' | 'force'): Promise<void>;
}
export interface SyntheticEventSink {
  emit(event: { type: 'cancelled' | 'force_stopped'; reason: string; at: number }): void;
}

export interface CancelControllerDeps {
  logger: Logger;
  backend: CancelableBackend;
  toolExecutor: CancelableToolExecutor;
  ui: SyntheticEventSink;
  /** the AbortController owning the outbound fetch for the current turn. */
  getAbortController(): AbortController | undefined;
  /** the ws for the current turn, if any. */
  getActiveWs(): CancelableWs | undefined;
  /** the workflow id in flight, if any. */
  getActiveWorkflowId(): string | undefined;
}

export class CancelController {
  #logger: Logger;

  #deps: CancelControllerDeps;

  #inFlight = false;

  #frozen = false;

  constructor(deps: CancelControllerDeps) {
    this.#deps = deps;
    this.#logger = withPrefix(deps.logger, '[CancelController]');
  }

  isFrozen(): boolean {
    return this.#frozen;
  }

  /** polite cancel: SIGTERM-ish. safe to call multiple times. */
  async cancel(reason = 'user cancel'): Promise<void> {
    if (this.#inFlight) return;
    this.#inFlight = true;
    try {
      // 1. local fetch abort. cheap and immediate.
      const ac = this.#deps.getAbortController();
      try {
        ac?.abort(reason);
      } catch (err) {
        this.#logger.debug?.(`AbortController.abort threw: ${(err as Error).message}`);
      }

      // 2. server-side workflow cancel. NEW behavior — stops burn.
      const wfId = this.#deps.getActiveWorkflowId();
      if (wfId) {
        try {
          await this.#deps.backend.cancelActiveWorkflow(wfId, reason);
        } catch (err) {
          this.#logger.warn(`backend workflow cancel failed for '${wfId}'`, err as Error);
        }
      }

      // 3. close ws for this turn so trailing checkpoints don't repaint ui.
      const ws = this.#deps.getActiveWs();
      if (ws && ws.readyState === ws.OPEN) {
        try {
          ws.close(1000, 'user cancel');
        } catch (err) {
          this.#logger.debug?.(`ws.close threw: ${(err as Error).message}`);
        }
      }

      // 4. kill tool child processes (bash, network fetchers, etc.).
      try {
        await this.#deps.toolExecutor.killActive('cancel');
      } catch (err) {
        this.#logger.warn('toolExecutor.killActive failed', err as Error);
      }

      // 5. synthesize a ui event so the state machine settles on "cancelled"
      //    even if no more backend events arrive.
      this.#deps.ui.emit({ type: 'cancelled', reason, at: Date.now() });
    } finally {
      this.#inFlight = false;
    }
  }

  /** force stop: polite cancel + SIGKILL escalation + freeze ui event apply. */
  async forceStop(reason = 'user force stop'): Promise<void> {
    this.#frozen = true;
    await this.cancel(reason);
    // escalate on tool executor.
    try {
      await withTimeout(this.#deps.toolExecutor.killActive('force'), 250);
    } catch (err) {
      this.#logger.warn('forceStop: killActive(force) timed out, moving on', err as Error);
    }
    this.#deps.ui.emit({ type: 'force_stopped', reason, at: Date.now() });
  }

  /** call after a turn ends normally so the next turn is not frozen. */
  reset(): void {
    this.#frozen = false;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_resolve, reject) => {
    t = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    (t as unknown as { unref?: () => void }).unref?.();
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}
