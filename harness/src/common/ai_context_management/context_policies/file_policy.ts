// NOTE: we are replacing 'path' with 'path-browserify' for the browser environment
// see scripts/esbuild/browser.ts for more detail
import { join } from 'path';
import { URI } from 'vscode-uri';
import * as yaml from 'js-yaml';
import { minimatch } from 'minimatch';
import { WorkspaceFolder } from 'vscode-languageserver-types';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import type { AIContextPolicyResponse } from '@gitlab-org/ai-context';
import { RepositoryService } from '@gitlab-org/repositories';
import { FsClient } from '../../services/fs/fs';
import { log } from '../../log';
import { AbstractAIContextPolicyProvider } from '../ai_context_policy_provider';

export const DisabledReason = 'File disabled by context policy';

export enum POLICIES {
  // this eslint violation predates the new enum naming rules
  // eslint-disable-next-line @typescript-eslint/naming-convention
  allow = 'allow',
  // this eslint violation predates the new enum naming rules
  // eslint-disable-next-line @typescript-eslint/naming-convention
  block = 'block',
}

export type PolicyConfig = {
  ai_context_policy: POLICIES;
  exclude: string[];
};

export const DefaultPolicy: PolicyConfig = {
  ai_context_policy: POLICIES.allow,
  exclude: [],
};

export interface FilePolicyProvider extends AbstractAIContextPolicyProvider {}

export const FilePolicyProvider = createInterfaceId<FilePolicyProvider>('FilePolicyProvider');

@Injectable(FilePolicyProvider, [RepositoryService, FsClient])
export class DefaultFilePolicyProvider
  extends AbstractAIContextPolicyProvider
  implements FilePolicyProvider
{
  #fsClient: FsClient;

  #repositoryService: RepositoryService;

  #policyConfig: PolicyConfig;

  #policyType: POLICIES;

  #excludePatterns: string[];

  constructor(repositoryService: RepositoryService, fsClient: FsClient) {
    super();
    this.#repositoryService = repositoryService;
    this.#fsClient = fsClient;
    this.#excludePatterns = [];
    this.#policyType = DefaultPolicy.ai_context_policy;
    this.#policyConfig = DefaultPolicy;
    this.#repositoryService.onWorkspaceRepositoriesFinished(async (workspaceFolder) => {
      await this.init(workspaceFolder);
    });
  }

  async init(workspaceFolder: WorkspaceFolder): Promise<void> {
    if (!workspaceFolder) {
      return;
    }
    try {
      const filePath = join(URI.parse(workspaceFolder.uri).fsPath, '.ai-context-policy.yml');
      const content = await this.#fsClient.promises.readFile(filePath, 'utf8');
      if (content) {
        this.#policyConfig = yaml.load(content) as PolicyConfig;
      } else {
        this.#policyConfig = DefaultPolicy;
      }
    } catch (e) {
      if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
        log.info('[File Policy] .ai-context-policy.yml file was not found, using default policy');
      } else {
        log.error(`[File Policy] Error while reading .ai-context-policy.yml: ${e}`);
      }
      this.#policyConfig = DefaultPolicy;
    }
    log.info(`[File Policy] Using the config: ${JSON.stringify(this.#policyConfig)}`);
    const { ai_context_policy: defaultPolicy, exclude } = this.#policyConfig;
    this.#excludePatterns = exclude || [];
    this.#policyType = defaultPolicy;
    if (![POLICIES.block, POLICIES.allow].includes(this.#policyType)) {
      log.error(`[File Policy] Invalid policy type: ${this.#policyType}`);
    }
  }

  async isContextItemAllowed(relativePath: string | undefined): Promise<AIContextPolicyResponse> {
    if (!relativePath) {
      return Promise.resolve({
        enabled: false,
        disabledReasons: ['File not found'],
      });
    }
    const isInExcludePattern = this.#excludePatterns.some((pattern: string) =>
      minimatch(relativePath, pattern),
    );
    if (this.#policyType === POLICIES.block) {
      return Promise.resolve({
        enabled: isInExcludePattern, // For 'block', if the path is in the exclude list, the policy allows it
        ...(!isInExcludePattern && { disabledReasons: [DisabledReason] }),
      });
    }
    return Promise.resolve({
      enabled: !isInExcludePattern, // For 'allow', if the path is in the exclude list, the policy blocks it
      ...(isInExcludePattern && { disabledReasons: [DisabledReason] }),
    });
  }
}
