import crypto from 'crypto';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { errAsync, ResultAsync } from 'neverthrow';
import { Service, Implements, ServiceLifetime, createInterfaceId } from '@gitlab/needle';
import { OAuthFinalizer, ServerName } from '../../../types';
import { AuthFlowError } from '../errors';
import { McpAuthFinalizerRegistry, McpAuthFlowController, AuthFlowEvent } from '../types';

export type AuthFlowManagerOptions = Readonly<{ ttlMs?: number }>;
export const DEFAULT_FLOW_TTL_MS = 5 * 60_000; // 5 minutes

interface FlowRecord {
  readonly serverName: ServerName;
  readonly createdAt: number; // ms
  timeout?: NodeJS.Timeout; // per-flow timer
  done?: boolean; // guards double completion
}

export interface McpAuthFlowManager extends McpAuthFinalizerRegistry, McpAuthFlowController {}

export const McpAuthFlowManager = createInterfaceId<McpAuthFlowManager>('AuthFlowManager');

@Service({ lifetime: ServiceLifetime.Singleton, dependencies: [Logger] })
@Implements(McpAuthFlowManager)
export class DefaultMcpAuthFlowManager implements McpAuthFlowManager {
  #flows = new Map<string, FlowRecord>();

  #finalizers = new Map<ServerName, OAuthFinalizer>();

  #authFlowHandlers = new Set<(event: AuthFlowEvent) => void>();

  #ttlMs: number;

  #logger: Logger;

  constructor(logger: Logger, opts: AuthFlowManagerOptions = {}) {
    this.#logger = withPrefix(logger, '[MCP][AuthFlow]');
    this.#ttlMs = Math.max(1_000, opts.ttlMs ?? DEFAULT_FLOW_TTL_MS);
  }

  // ---- Finalizer registry API ----
  registerAuthFinalizer(serverName: ServerName, finalizer: OAuthFinalizer): void {
    this.#finalizers.set(serverName, finalizer);
    this.#logger.debug(`Finalizer registered - server="${serverName}"`);
  }

  unregisterAuthFinalizer(serverName: ServerName): void {
    this.#finalizers.delete(serverName);
    this.#logger.debug(`Finalizer unregistered - server="${serverName}"`);
  }

  clearFinalizers(): void {
    this.#finalizers.clear();
    this.#logger.debug('Finalizers cleared');
  }

  // ---- Flow lifecycle ----
  startFlow(serverName: ServerName): string {
    const state = crypto.randomBytes(16).toString('hex');
    const rec: FlowRecord = { serverName, createdAt: Date.now() };

    // Set per-flow timeout; unref so it doesn't keep the process alive.
    rec.timeout = setTimeout(() => this.#onTimeout(state), this.#ttlMs);
    rec.timeout?.unref();

    this.#flows.set(state, rec);
    this.#logger.debug(`Flow started - server=${serverName}`);
    return state;
  }

  completeFlow(state: string, code: string | null): ResultAsync<void, AuthFlowError> {
    const rec = this.#flows.get(state);
    if (!rec) {
      this.#logger.debug(`Flow state not found - state=${state}`);
      return errAsync(AuthFlowError.stateNotFound());
    }
    if (rec.done) {
      // Already completed (either by timeout or earlier completion). Treat as success.
      return ResultAsync.fromSafePromise(Promise.resolve());
    }

    const finalizer = this.#finalizers.get(rec.serverName);
    if (!finalizer) {
      this.#logger.debug(`Finalizer not found - server="${rec.serverName}"`);
      return errAsync(AuthFlowError.finalizerNotFound(rec.serverName));
    }

    // Mark done & clear timer BEFORE calling finalizer to avoid races
    rec.done = true;
    this.#clearTimer(rec);
    this.#flows.delete(state);

    return finalizer.finishAuth(code).mapErr((e) => {
      this.#logger.error(`Finalization failed - server="${rec.serverName}"`);
      return AuthFlowError.finalizationFailed(rec.serverName, e);
    });
  }

  clearFlows(): void {
    for (const [, rec] of this.#flows) this.#clearTimer(rec);
    this.#flows.clear();
  }

  // ---- Event subscription API ----
  onAuthFlowStarted(handler: (event: AuthFlowEvent) => void): void {
    this.#authFlowHandlers.add(handler);
    this.#logger.debug('Auth flow handler registered');
  }

  offAuthFlowStarted(handler: (event: AuthFlowEvent) => void): void {
    this.#authFlowHandlers.delete(handler);
    this.#logger.debug('Auth flow handler unregistered');
  }

  /**
   * Notify all subscribers that an auth flow has started with an authorization URL
   * This is called by the OAuth provider when redirecting to authorization
   */
  notifyAuthFlowStarted(serverName: ServerName, authUrl: string, state: string): void {
    const event: AuthFlowEvent = { serverName, authUrl, state };
    this.#logger.debug(`Notifying auth flow started - server=${serverName} state=${state}`);

    for (const handler of this.#authFlowHandlers) {
      try {
        handler(event);
      } catch (error) {
        this.#logger.error(`Auth flow handler error - server=${serverName}`, error);
      }
    }
  }

  // ---- Private helpers ----
  #clearTimer(rec: FlowRecord): void {
    if (rec.timeout) {
      clearTimeout(rec.timeout);
      // eslint-disable-next-line no-param-reassign
      rec.timeout = undefined;
    }
  }

  #onTimeout(state: string): void {
    const rec = this.#flows.get(state);
    // If flow already completed or missing, nothing to do
    if (!rec || rec.done) return;

    // Mark as done and remove from map first to ensure single-shot behavior
    rec.done = true;
    this.#clearTimer(rec);
    this.#flows.delete(state);

    const finalizer = this.#finalizers.get(rec.serverName);
    if (!finalizer) {
      // No finalizer to notify; we’re done.
      this.#logger.debug(`Flow timeout but no finalizer registered - server="${rec.serverName}"`);
      return;
    }

    this.#logger.debug(`Flow timeout notifying finalizer - server="${rec.serverName}"`);
    // Best-effort notify of timeout; ignore result and never throw in timer
    finalizer
      .finishAuth(null)
      .mapErr(() => undefined)
      .unwrapOr(undefined)
      .catch(() => undefined);
  }
}
