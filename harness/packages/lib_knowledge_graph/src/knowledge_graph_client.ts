import { Logger } from '@gitlab-org/logging';
import { isFileSchemeUri, parseURIString, workspaceFolderPathFromUri } from '@gitlab-org/fs';
import fetch from 'cross-fetch';

export interface KnowledgeGraphClient {
  index(path: string): Promise<void>;
  updateContextExclusion(projectPath: string, exclusionRules: string[]): Promise<void>;
}

export class LocalKnowledgeGraphClient implements KnowledgeGraphClient {
  #logger: Logger;

  #baseUrl: URL;

  constructor(logger: Logger, url: URL) {
    this.#logger = logger;
    this.#baseUrl = url;
  }

  async index(fileUri: string): Promise<void> {
    if (!isFileSchemeUri(fileUri)) {
      this.#logger.debug(
        `Skipping indexing for virtual workspace: ${parseURIString(fileUri).scheme}:// scheme not supported`,
      );
      return;
    }

    const url = new URL('/api/workspace/index', this.#baseUrl);
    const workspaceFolderPath = workspaceFolderPathFromUri(fileUri);

    this.#logger.info(`Indexing workspace ${workspaceFolderPath}`);

    try {
      // We use `cross-fetch` here rather than our `LsFetch` because the local Knowledge Graph server
      // won't be using the proxy and SSL configuration embedded in the `LsFetch`.
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: this.#defaultHeaders(),
        body: JSON.stringify({ workspace_folder_path: workspaceFolderPath }),
      });

      if (!response.ok) {
        this.#logger.error(
          `Error indexing workspace ${workspaceFolderPath}: ${response.status} ${response.statusText}.`,
        );
        return;
      }

      this.#logger.info(`Successfully indexed workspace ${workspaceFolderPath}.`);
    } catch (error) {
      this.#logger.error(`Error indexing workspace ${workspaceFolderPath}:`, error);
    }
  }

  async updateContextExclusion(projectPath: string, exclusionRules: string[]): Promise<void> {
    const url = new URL('/api/project/context-exclusion', this.#baseUrl);

    this.#logger.info(
      `Updating context exclusion rules for project ${projectPath} with ${exclusionRules.length} rules`,
    );

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: this.#defaultHeaders(),
        body: JSON.stringify({ project_path: projectPath, patterns: exclusionRules }),
      });

      if (!response.ok) {
        this.#logger.info(
          `Context exclusion update unavailable for project ${projectPath}: ${response.status} ${response.statusText}.`,
        );
        return;
      }

      this.#logger.info(`Successfully updated context exclusion for project ${projectPath}.`);
    } catch (error) {
      this.#logger.info(`Context exclusion update unavailable for project ${projectPath}:`, error);
    }
  }

  #defaultHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }
}
