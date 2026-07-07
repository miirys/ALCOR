import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { isGlab } from '@gitlab-org/tui';

import { ConfigurationController } from '../commands/config/configuration_controller';
import { ParsedCliInput } from '../parse';
import { getGlabCredentials, type GlabCredential } from './glab_credential_helper';

export type CredentialSource =
  | { type: 'env-or-flag' }
  | { type: 'config-file'; path: string }
  | { type: 'glab'; credentialType: 'pat' | 'oauth' }
  | { type: 'none' };

export function formatCredentialSource(source: CredentialSource): { short: string; long: string } {
  switch (source.type) {
    case 'env-or-flag':
      return { short: 'env var / flag', long: 'GITLAB_TOKEN / --gitlab-auth-token' };
    case 'config-file':
      return { short: 'config file', long: `config file at ${source.path}` };
    case 'glab':
      return source.credentialType === 'oauth'
        ? { short: 'glab OAuth', long: 'glab credential helper (OAuth)' }
        : { short: 'glab PAT', long: 'glab credential helper (PAT)' };
    case 'none':
      return { short: 'no credentials', long: 'no credentials found' };
    default:
      throw new Error(`Unhandled credential source type`);
  }
}

export interface Credentials {
  token: string;
  baseUrl: string;
  source: CredentialSource;
}

/**
 * Provides auth credentials (token + baseUrl) for API calls.
 * Handles static tokens from config as well as dynamic (OAuth) tokens
 * with expiry-aware caching.
 */
export interface CredentialProvider {
  /**
   * Returns the current credentials (token + baseUrl).
   * For OAuth tokens, transparently refreshes when expired.
   * When using glab credential helper, baseUrl comes from glab's instance_url.
   */
  getCredentials(): Promise<Credentials>;
}

export const CredentialProvider = createInterfaceId<CredentialProvider>('CredentialProvider');

/** How many seconds before actual expiry we consider the token expired. */
const EXPIRY_BUFFER_SECONDS = 30;

@Injectable(CredentialProvider, [ConfigurationController, Logger, ParsedCliInput])
export class DefaultCredentialProvider implements CredentialProvider {
  #configController: ConfigurationController;

  #logger: Logger;

  #cliInput: ParsedCliInput;

  #cachedCredential: GlabCredential | null = null;

  // Patch B: notify listeners (the proactive TokenRefresher) whenever a fresh
  // credential is issued, so a refresh can be scheduled before expiry. A plain
  // callback list is used because @gitlab-org/core exposes no EventEmitterImpl
  // here (drift vs. the wiring note).
  #issuedListeners: ((cred: { expiresAt?: number; token: string }) => void)[] = [];

  constructor(configController: ConfigurationController, logger: Logger, cliInput: ParsedCliInput) {
    this.#configController = configController;
    this.#logger = withPrefix(logger, '[CredentialProvider]');
    this.#cliInput = cliInput;
  }

  /** Subscribe to credential issuance (used by TokenRefresher). */
  onIssued(cb: (cred: { expiresAt?: number; token: string }) => void): void {
    this.#issuedListeners.push(cb);
  }

  /** Force a fresh credential, bypassing the cache. */
  async getFreshCredential(): Promise<Credentials> {
    this.#cachedCredential = null;
    return this.getCredentials();
  }

  #emitIssued(credential: GlabCredential): void {
    const expiresAt =
      credential.type === 'oauth' && credential.expiresAt
        ? credential.expiresAt.getTime()
        : undefined;
    for (const cb of this.#issuedListeners) {
      try {
        cb({ expiresAt, token: credential.token });
      } catch (err) {
        this.#logger.warn('onIssued listener threw', err as Error);
      }
    }
  }

  async getCredentials(): Promise<Credentials> {
    // 1. Env var / CLI flag always takes priority regardless of distribution
    if (this.#cliInput.gitlabAuthToken) {
      const baseUrl =
        this.#cliInput.gitlabBaseUrl || this.#configController.getDuoConfiguration().gitlabBaseUrl;
      this.#logger.debug('Using static token from env var / CLI flag');
      return {
        token: this.#cliInput.gitlabAuthToken,
        baseUrl,
        source: { type: 'env-or-flag' },
      };
    }

    // 2. Config file token (non-glab only)
    if (!isGlab()) {
      const config = this.#configController.getDuoConfiguration();
      if (config.gitlabAuthToken) {
        this.#logger.debug('Using static token from config file');
        const configModel = this.#configController.getConfigurationModel();
        const source: CredentialSource = {
          type: 'config-file',
          path: configModel.configFilePath ?? 'unknown path',
        };
        return { token: config.gitlabAuthToken, baseUrl: config.gitlabBaseUrl, source };
      }
    } else {
      this.#logger.debug('Glab distribution: skipping config file, using glab credential helper');
    }

    // 3. Fall back to glab credential helper
    const credential = this.#getGlabCredentials();
    if (!credential) {
      const config = this.#configController.getDuoConfiguration();
      return { token: '', baseUrl: config.gitlabBaseUrl, source: { type: 'none' } };
    }
    return credential;
  }

  #getGlabCredentials(): Credentials | null {
    if (this.#cachedCredential && !this.#isExpired(this.#cachedCredential)) {
      const source: CredentialSource = {
        type: 'glab',
        credentialType: this.#cachedCredential.type === 'oauth' ? 'oauth' : 'pat',
      };
      return {
        token: this.#cachedCredential.token,
        baseUrl: this.#cachedCredential.instanceUrl,
        source,
      };
    }

    this.#logger.debug('Fetching fresh glab credential');
    const credential = getGlabCredentials(this.#logger, this.#cliInput.cwd);

    if (!credential) {
      this.#logger.warn('No credential available from glab');
      return null;
    }

    this.#cachedCredential = credential;
    this.#emitIssued(credential);
    const source: CredentialSource = {
      type: 'glab',
      credentialType: credential.type === 'oauth' ? 'oauth' : 'pat',
    };
    return { token: credential.token, baseUrl: credential.instanceUrl, source };
  }

  #isExpired(credential: GlabCredential): boolean {
    if (credential.type !== 'oauth') return false;
    const bufferMs = EXPIRY_BUFFER_SECONDS * 1000;
    return credential.expiresAt.getTime() - bufferMs <= Date.now();
  }
}
