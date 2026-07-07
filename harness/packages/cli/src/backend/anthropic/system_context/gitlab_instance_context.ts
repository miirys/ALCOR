import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { type AIContextItem, SystemContextProvider } from '@gitlab-org/ai-context';
import { GitLabApiService, InstanceInfo } from '@gitlab-org/core';

@Injectable(SystemContextProvider, [Logger, GitLabApiService])
export class GitLabInstanceContextProvider implements SystemContextProvider {
  #logger: Logger;

  #gitLabApiService: GitLabApiService;

  constructor(logger: Logger, gitLabApiService: GitLabApiService) {
    this.#logger = withPrefix(logger, '[GitLabInstanceContextProvider]');
    this.#gitLabApiService = gitLabApiService;
  }

  async getItems(): Promise<AIContextItem[]> {
    if (!this.#gitLabApiService.instanceInfo) {
      return [];
    }

    try {
      return [
        {
          category: 'agent_user_environment',
          content: await this.#getGitLabInstanceContext(this.#gitLabApiService.instanceInfo),
          id: 'cli_gitlab_instance_context',
          metadata: {
            title: 'GitLab Instance Context',
            enabled: true,
            subType: 'snippet',
            icon: 'user',
            secondaryText:
              'Additional information about the GitLab instance the CLI is connected to',
            subTypeLabel: '',
          },
        },
      ];
    } catch (error) {
      this.#logger.warn('Could not retrieve gitlab instance context', error);
      return [];
    }
  }

  async #getGitLabInstanceContext(instanceInfo: InstanceInfo): Promise<string> {
    const { instanceUrl, instanceVersion } = instanceInfo;

    //   <gitlab_instance_type>saas</gitlab_instance_type> MISSING
    return `<gitlab_instance>
  <gitlab_instance_url>${instanceUrl}</gitlab_instance_url>
  <gitlab_instance_version>${instanceVersion}</gitlab_instance_version>
</gitlab_instance>`;
  }
}
