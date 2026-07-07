import { Injectable, createInterfaceId } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import type { CredentialProvider } from './credential_provider';

/**
 * proactively refresh the cached credential BEFORE it expires, so an idle
 * session doesn't die mid-keystroke.
 *
 * design points:
 *  - one active timer at a time; each issuance re-schedules.
 *  - refresh lead is a fraction of remaining ttl, floored at 30s so a
 *    short-lived token doesn't cause a busy loop.
 *  - failures are LOGGED, not thrown. next real request will still hit the
 *    on-demand refresh path in the provider.
 *  - .unref() so we don't keep the process alive.
 */
// module-level constants: the host repo transpiles decorators with
// @babel/plugin-proposal-decorators v2023-11, under which static class fields
// on a decorated class emit a broken `_initClass` helper.
const DEFAULT_LEAD_MS = 120_000;
const MIN_LEAD_MS = 30_000;

// Interface id: the supplied file used the class as its own @Injectable token,
// which does not type-check under this needle version.
export const TokenRefresherService = createInterfaceId<TokenRefresher>('TokenRefresher');

@Injectable(TokenRefresherService, [Logger])
export class TokenRefresher {
  #logger: Logger;

  #provider: CredentialProvider | undefined;

  #timer: ReturnType<typeof setTimeout> | undefined;

  #stopped = false;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[TokenRefresher]');
  }

  attach(provider: CredentialProvider): void {
    this.#provider = provider;
    // the provider must expose an onIssued(cred => ...) event; small addition
    // in credential_provider.ts alongside its existing #cachedCredential set.
    (
      provider as unknown as {
        onIssued: (cb: (cred: { expiresAt?: number }) => void) => void;
      }
    ).onIssued((cred) => this.#schedule(cred));
  }

  stop(): void {
    this.#stopped = true;
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  #schedule(cred: { expiresAt?: number }): void {
    if (this.#stopped) return;
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    if (!cred.expiresAt) return; // static PATs don't expire; nothing to do.
    const now = Date.now();
    const ttl = cred.expiresAt - now;
    if (ttl <= 0) return;
    const lead = Math.max(MIN_LEAD_MS, Math.min(DEFAULT_LEAD_MS, Math.floor(ttl / 3)));
    const delay = Math.max(1_000, ttl - lead);
    this.#logger.debug?.(
      `scheduling proactive refresh in ${Math.round(delay / 1000)}s (ttl=${Math.round(ttl / 1000)}s)`,
    );
    this.#timer = setTimeout(() => this.#refresh(), delay);
    (this.#timer as unknown as { unref?: () => void }).unref?.();
  }

  async #refresh(): Promise<void> {
    this.#timer = undefined;
    if (!this.#provider || this.#stopped) return;
    try {
      await (
        this.#provider as unknown as {
          getFreshCredential: () => Promise<unknown>;
        }
      ).getFreshCredential();
      this.#logger.debug?.('proactive token refresh ok');
    } catch (err) {
      // don't retry aggressively — next real request will attempt again.
      this.#logger.warn('proactive token refresh failed', err as Error);
    }
  }
}
