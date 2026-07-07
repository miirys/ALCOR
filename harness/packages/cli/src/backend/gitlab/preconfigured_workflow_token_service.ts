import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { WorkflowType } from '@gitlab-lsp/workflow-api';
import type { GenerateTokenResponse, WorkflowId } from '@gitlab-org/workflow-executor';
import { WorkflowTokenService, WorkflowRailsService } from '@gitlab-org/workflow-executor';
import { CredentialProvider } from '../../utils/credential_provider';
import { tryBuildWorkflowToken, GitLabParsedOptions } from './gitlab_parsed_options';

@Injectable(WorkflowTokenService, [
  Logger,
  GitLabParsedOptions,
  CredentialProvider,
  WorkflowRailsService,
])
export class PreConfiguredWorkflowTokenService implements WorkflowTokenService {
  #logger: Logger;

  #opts: GitLabParsedOptions;

  #credentialProvider: CredentialProvider;

  #disposed = false;

  #workflowRailsService: WorkflowRailsService;

  constructor(
    logger: Logger,
    opts: GitLabParsedOptions,
    credentialProvider: CredentialProvider,
    workflowRailsService: WorkflowRailsService,
  ) {
    this.#logger = withPrefix(logger, '[PreConfiguredWorkflowTokenService]');
    this.#opts = opts;
    this.#credentialProvider = credentialProvider;
    this.#workflowRailsService = workflowRailsService;
  }

  async getToken(
    workflowId: WorkflowId,
    workflowType?: WorkflowType,
  ): Promise<GenerateTokenResponse> {
    if (this.#disposed) {
      throw new Error('Token service has been disposed');
    }

    this.#logger.debug(`Building token for workflow "${workflowId}", type: "${workflowType}"`);

    const credentials = await this.#credentialProvider.getCredentials();
    const workflowToken = tryBuildWorkflowToken(this.#opts, credentials);

    if (!workflowToken) {
      throw new Error('Expected workflow token to be present in headless CI mode. This is a bug.');
    }

    return workflowToken;
  }

  getTokenFromCache(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options: {
      workflowType: WorkflowType;
      workflowId?: WorkflowId;
    },
  ): GenerateTokenResponse | null {
    // No longer caching — always build fresh from credentials
    return null;
  }

  cacheToken(
    workflowId: WorkflowId,
    workflowType: WorkflowType,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: GenerateTokenResponse,
  ): void {
    this.#logger.warn(
      `Ignoring cache request for workflow "${workflowId}", type "${workflowType}" - using pre-configured tokens which are immutable`,
    );
  }

  async revokeToken(workflowId: WorkflowId, token: GenerateTokenResponse): Promise<void> {
    try {
      this.#logger.debug(`Revoking token for workflow ${workflowId}`);
      await this.#workflowRailsService.revokeWorkflowToken(token);
    } catch (err) {
      this.#logger.error('Error revoking token', err);
    }
  }

  getServerCapabilities(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options: {
      workflowType: WorkflowType;
      workflowId?: WorkflowId;
    },
  ): string[] | null {
    // Pre-configured tokens don't have server capabilities from direct_access endpoint
    return null;
  }

  dispose(): void {
    this.#disposed = true;
    this.#logger.debug('Disposed pre-configured token service');
  }
}
