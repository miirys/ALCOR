import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { WorkflowType } from '@gitlab-lsp/workflow-api';
import { Disposable } from '@gitlab-org/disposable';
import type { WorkflowId } from '../index';
import { GenerateTokenResponse } from './types';
import { WorkflowRailsService } from './workflow_rails_service';

export interface WorkflowTokenService extends Disposable {
  getToken(
    workflowId: WorkflowId,
    workflowType?: WorkflowType,
    rootNamespaceId?: string,
    projectPath?: string,
  ): Promise<GenerateTokenResponse>;
  getTokenFromCache(options: {
    workflowType: WorkflowType;
    workflowId?: WorkflowId;
  }): GenerateTokenResponse | null;
  getServerCapabilities(options: {
    workflowType: WorkflowType;
    workflowId?: WorkflowId;
  }): string[] | null;
  cacheToken(
    workflowId: WorkflowId,
    workflowType: WorkflowType,
    token: GenerateTokenResponse,
  ): void;
  revokeToken(workflowId: WorkflowId, token: GenerateTokenResponse): Promise<void>;
}

export const WorkflowTokenService = createInterfaceId<WorkflowTokenService>('WorkflowTokenService');

interface StoredToken {
  token: GenerateTokenResponse;
  timeoutId: NodeJS.Timeout;
}

// Buffer time before expiry to clear token (30 seconds)
const EXPIRY_BUFFER_MS = 30 * 1000;

@Injectable(WorkflowTokenService, [Logger, WorkflowRailsService])
export class DefaultWorkflowTokenService implements WorkflowTokenService {
  #logger: Logger;

  #workflowRailsService: WorkflowRailsService;

  // We need to get a token multiple times per workflow, e.g. after each user interaction.
  // So we store tokens here against workflowId to reuse across the whole workflow
  // For chat workflows, we use a special key to share tokens across chat sessions
  #workflowTokens = new Map<WorkflowId, StoredToken>();

  // Special key for shared chat token
  readonly #CHAT_SHARED_TOKEN_KEY: WorkflowId = 'CHAT_SHARED_TOKEN';

  constructor(logger: Logger, workflowRailsService: WorkflowRailsService) {
    this.#logger = withPrefix(logger, '[WorkflowTokenService]');
    this.#workflowRailsService = workflowRailsService;
  }

  getTokenFromCache({
    workflowType,
    workflowId,
  }: {
    workflowType: WorkflowType;
    workflowId?: WorkflowId;
  }): GenerateTokenResponse | null {
    const isChatWorkflow = workflowType === WorkflowType.CHAT;

    let key: WorkflowId;

    if (isChatWorkflow) {
      // For chat workflows, use a shared token key
      key = this.#CHAT_SHARED_TOKEN_KEY;
    } else {
      // For non-chat workflows, workflowId is required
      if (!workflowId) {
        return null;
      }
      key = workflowId;
    }

    // Check if we have an existing valid token
    if (this.#workflowTokens.has(key)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const { token } = this.#workflowTokens.get(key)!;
      return token;
    }

    return null;
  }

  getServerCapabilities({
    workflowType,
    workflowId,
  }: {
    workflowType: WorkflowType;
    workflowId?: WorkflowId;
  }): string[] | null {
    const token = this.getTokenFromCache({ workflowType, workflowId });
    return token?.server_capabilities || null;
  }

  async getToken(
    workflowId: WorkflowId,
    workflowType: WorkflowType,
    rootNamespaceId?: string,
    projectPath?: string,
  ): Promise<GenerateTokenResponse> {
    // Check if we have an existing valid token
    const cachedToken = this.getTokenFromCache({ workflowType, workflowId });
    if (cachedToken) {
      this.#logger.debug(`Reusing existing valid token for workflow "${workflowId}"`);
      return cachedToken;
    }

    this.#logger.debug(`Fetching new token for workflow "${workflowId}", type: "${workflowType}"`);
    const token = await this.#workflowRailsService.getWorkflowToken(
      workflowType,
      rootNamespaceId,
      projectPath,
    );

    this.cacheToken(workflowId, workflowType, token);

    return token;
  }

  cacheToken(
    workflowId: WorkflowId,
    workflowType: WorkflowType,
    token: GenerateTokenResponse,
  ): void {
    const isChatWorkflow = workflowType === WorkflowType.CHAT;

    // For chat workflows, use a shared token key; for others, use the specific workflowId
    const key = isChatWorkflow ? this.#CHAT_SHARED_TOKEN_KEY : workflowId;

    // Calculate expiry time (in milliseconds)
    const workflowTokenExpiresAt = this.#toMilliseconds(
      token.duo_workflow_service.token_expires_at,
    );
    const railsTokenExpiresAt = this.#toMilliseconds(token.gitlab_rails.token_expires_at);
    const expiresAt = Math.min(workflowTokenExpiresAt, railsTokenExpiresAt);

    // Subtract buffer time from timeout, so that we clear the token before it has expired
    const now = Date.now();
    const timeoutDuration = Math.max(0, expiresAt - now - EXPIRY_BUFFER_MS);

    const timeoutId = setTimeout(() => {
      this.#logger.debug(`Token for workflow "${key}" is about to expire, clearing it`);
      this.#clearWorkflowToken(key);
    }, timeoutDuration);

    this.#workflowTokens.set(key, { token, timeoutId });

    this.#logger.debug(
      `Token for workflow "${key}" will expire at ${new Date(expiresAt).toISOString()}, ` +
        `clearing in ${timeoutDuration / 1000} seconds`,
    );
  }

  async revokeToken(workflowId: WorkflowId, token: GenerateTokenResponse): Promise<void> {
    try {
      this.#logger.debug('Revoking token');

      await this.#workflowRailsService.revokeWorkflowToken(token);
    } catch (err) {
      this.#logger.error('Error revoking token', err);
    } finally {
      const chatTokenInfo = this.#workflowTokens.get(this.#CHAT_SHARED_TOKEN_KEY);
      const isSharedChatToken = chatTokenInfo && token === chatTokenInfo.token;

      const key = isSharedChatToken ? this.#CHAT_SHARED_TOKEN_KEY : workflowId;
      if (this.#workflowTokens.has(key)) {
        this.#clearWorkflowToken(key);
        this.#logger.debug(`Removed token for workflow "${key}" from cache`);
      }
    }
  }

  /**
   * Convert a token expiry value to ms. The workflow token seems to return ticks, while the rails token seems to return an iso string.
   * Normalise them both to ms
   */
  #toMilliseconds(value: number | string | unknown): number {
    if (typeof value === 'number') {
      return value * 1000;
    }

    if (typeof value === 'string') {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        throw new Error(`Failed to parse token expiry date string: "${value}"`);
      }
      return date.getTime();
    }

    throw new Error(`Received unexpected token expiry: "${value}"`);
  }

  #clearWorkflowToken(workflowId: WorkflowId) {
    if (!this.#workflowTokens.has(workflowId)) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const tokenInfo = this.#workflowTokens.get(workflowId)!;
    clearTimeout(tokenInfo.timeoutId);
    this.#workflowTokens.delete(workflowId);
  }

  dispose(): void {
    for (const workflowId of this.#workflowTokens.keys()) {
      this.#clearWorkflowToken(workflowId);
    }

    this.#logger.debug('Disposed token service, cleared all tokens and timeouts');
  }
}
