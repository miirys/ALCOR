import {
  AgentPlatformProjectService,
  AgentPlatformRepositories,
} from '@gitlab-lsp/workflow-api/node';
import { Logger } from '@gitlab-org/logging';
import { MessageBus } from '@gitlab-org/message-bus';
import { ControllerResponse } from './types';
import { NO_REPLY } from './constants';

interface RepositoryData {
  repositoriesData: AgentPlatformRepositories;
  repoToProjectPathMap: Record<string, string>;
}

const buildRepositoryResponse = async (
  agentPlatformProjectService: AgentPlatformProjectService,
  repositoriesData?: AgentPlatformRepositories,
): Promise<RepositoryData> => {
  // If repositoriesData is provided (from event), use it; otherwise fetch it
  const data = repositoriesData || (await agentPlatformProjectService.getRepositories());

  // Get selected projects for each repository
  const selectedProjectsPromises = data.repositories.map(async (repo) => {
    const selected = await agentPlatformProjectService.getSelectedProject(repo.rootFsPath);
    return selected ? { rootFsPath: repo.rootFsPath, selected } : null;
  });

  const selectedProjectsResults = await Promise.all(selectedProjectsPromises);
  const repoToProjectPathMap: Record<string, string> = {};
  selectedProjectsResults.forEach((result) => {
    if (result) {
      repoToProjectPathMap[result.rootFsPath] = result.selected;
    }
  });

  return {
    repositoriesData: data,
    repoToProjectPathMap,
  };
};

const createRepositoriesChangeHandler = (
  agentPlatformProjectService: AgentPlatformProjectService,
  messageBus: MessageBus,
  log: Logger,
) => {
  return async (repositoriesResponse: AgentPlatformRepositories) => {
    try {
      log.debug('[RepositoriesController] Repositories changed, notifying client');
      const { repositoriesData: updatedData, repoToProjectPathMap: updatedMap } =
        await buildRepositoryResponse(agentPlatformProjectService, repositoriesResponse);
      messageBus.sendNotification('setRepositories', updatedData);
      messageBus.sendNotification('setRepoToProjectPathMap', updatedMap);
    } catch (e) {
      const error = e as Error;
      log.error('[RepositoriesController] Failed to handle repositories change', error);
    }
  };
};

export const initRepositoriesController = (
  agentPlatformProjectService: AgentPlatformProjectService,
  log: Logger,
  messageBus: MessageBus,
) => {
  return {
    async getRepositories(): Promise<ControllerResponse[]> {
      try {
        const { repositoriesData, repoToProjectPathMap } = await buildRepositoryResponse(
          agentPlatformProjectService,
        );

        // Setup listener for repository changes
        agentPlatformProjectService.onRepositoriesChange(
          createRepositoriesChangeHandler(agentPlatformProjectService, messageBus, log),
        );

        return [
          {
            eventName: 'setRepositories',
            data: repositoriesData,
          },
          {
            eventName: 'setRepoToProjectPathMap',
            data: repoToProjectPathMap,
          },
        ];
      } catch (e) {
        const error = e as Error;
        log.error('[RepositoriesController] Failed to get workspace repositories', error);
        return [];
      }
    },

    async selectProjectForWorkflow({
      repositoryPath,
      projectPath,
    }: {
      repositoryPath: string;
      projectPath: string;
    }) {
      try {
        log.debug(
          `[RepositoriesController] Selecting project ${projectPath} for repository ${repositoryPath}`,
        );
        await agentPlatformProjectService.setSelectedProject(repositoryPath, projectPath);
        return NO_REPLY;
      } catch (e) {
        const error = e as Error;
        log.error('[RepositoriesController] Failed to select project', error);
        return NO_REPLY;
      }
    },
  };
};
