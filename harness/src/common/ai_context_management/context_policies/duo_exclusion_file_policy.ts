import { WorkspaceFolder } from 'vscode-languageserver-types';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import type { AIContextPolicyResponse } from '@gitlab-org/ai-context';
import { RepositoryService } from '@gitlab-org/repositories';
import { URI, Utils } from 'vscode-uri';
import { log } from '../../log';
import { AbstractAIContextPolicyProvider } from '../ai_context_policy_provider';
import {
  DuoExclusionChecker,
  DuoProjectAccessChecker,
  DuoProjectStatus,
} from '../../services/duo_access';
import { DISABLED_REASONS } from '../context_providers/constants';

export interface DuoExclusionFilePolicyProvider extends AbstractAIContextPolicyProvider {}

export const DuoExclusionFilePolicyProvider = createInterfaceId<DuoExclusionFilePolicyProvider>(
  'DuoExclusionFilePolicyProvider',
);

@Injectable(DuoExclusionFilePolicyProvider, [
  RepositoryService,
  DuoProjectAccessChecker,
  DuoExclusionChecker,
])
export class DefaultDuoExclusionFilePolicyProvider
  extends AbstractAIContextPolicyProvider
  implements DuoExclusionFilePolicyProvider
{
  #repositoryService: RepositoryService;

  #duoProjectAccessChecker: DuoProjectAccessChecker;

  #duoExclusionChecker: DuoExclusionChecker;

  #currentWorkspaceFolder: WorkspaceFolder | undefined;

  constructor(
    repositoryService: RepositoryService,
    duoProjectAccessChecker: DuoProjectAccessChecker,
    duoExclusionChecker: DuoExclusionChecker,
  ) {
    super();
    this.#repositoryService = repositoryService;
    this.#duoProjectAccessChecker = duoProjectAccessChecker;
    this.#duoExclusionChecker = duoExclusionChecker;
    this.#currentWorkspaceFolder = undefined;

    this.#repositoryService.onWorkspaceRepositoriesFinished((workspaceFolder) => {
      this.#currentWorkspaceFolder = workspaceFolder;
      log.info(`[Duo Exclusion Policy] Workspace folder initialized: ${workspaceFolder.uri}`);
    });
  }

  async isContextItemAllowed(relativePath: string): Promise<AIContextPolicyResponse> {
    if (!this.#currentWorkspaceFolder) {
      log.debug('[Duo Exclusion Policy] No workspace folder available, allowing context item');
      return Promise.resolve({
        enabled: true,
      });
    }

    // Create a full file URI from the relative path
    const workspaceUri = URI.parse(this.#currentWorkspaceFolder.uri);
    const fileUri = Utils.joinPath(workspaceUri, relativePath).toString();

    // Check project status and get the project info
    const projectStatus = this.#duoProjectAccessChecker.checkProjectStatus(
      fileUri,
      this.#currentWorkspaceFolder,
    );

    if (!projectStatus.project || projectStatus.status === DuoProjectStatus.NonGitlabProject) {
      log.debug('[Duo Exclusion Policy] No project found, allowing context item');
      return Promise.resolve({
        enabled: true,
      });
    }

    // Check if the file is excluded by the project's exclusion rules
    const exclusionResult = this.#duoExclusionChecker.checkFileExclusion(
      relativePath,
      projectStatus.project,
    );

    if (exclusionResult.isExcluded) {
      log.debug(
        `[Duo Exclusion Policy] File ${relativePath} is excluded by project exclusion rules`,
      );
      return Promise.resolve({
        enabled: false,
        disabledReasons: [DISABLED_REASONS.DUO_CONTEXT_EXCLUDED],
      });
    }

    log.debug(`[Duo Exclusion Policy] File ${relativePath} is allowed`);
    return Promise.resolve({
      enabled: true,
    });
  }
}
