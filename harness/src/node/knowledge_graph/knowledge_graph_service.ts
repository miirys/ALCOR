import { KnowledgeGraphManager } from '@gitlab-org/knowledge-graph';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { WorkspaceFolder } from 'vscode-languageserver';
import { Logger } from '@gitlab-org/logging';
import { ConfigService, ClientConfig } from '@gitlab-org/config';
import { isEqual } from 'lodash';
import { DuoWorkspaceProjectAccessCache, type DuoProject } from '@gitlab-org/legacy-common';

export interface KnowledgeGraphService {}

const KnowledgeGraphService = createInterfaceId<KnowledgeGraphService>('KnowledgeGraphService');

@Injectable(KnowledgeGraphService, [
  ConfigService,
  Logger,
  KnowledgeGraphManager,
  DuoWorkspaceProjectAccessCache,
])
export class DefaultKnowledgeGraphService implements KnowledgeGraphService {
  #knowledgeGraphManager: KnowledgeGraphManager;

  #workspaceFolders: WorkspaceFolder[] = [];

  #logger: Logger;

  #duoProjectAccessCache: DuoWorkspaceProjectAccessCache;

  #projectExclusionRules: Map<string, string[]> = new Map();

  constructor(
    configService: ConfigService,
    logger: Logger,
    knowledgeGraphManager: KnowledgeGraphManager,
    duoProjectAccessCache: DuoWorkspaceProjectAccessCache,
  ) {
    this.#knowledgeGraphManager = knowledgeGraphManager;
    this.#logger = logger;
    this.#duoProjectAccessCache = duoProjectAccessCache;

    configService.onConfigChange((config) => this.handleConfigChange(config));

    this.#duoProjectAccessCache.onDuoProjectCacheUpdate(async (projectsMap) => {
      await this.#handleProjectCacheUpdate(projectsMap);
    });
  }

  async handleConfigChange(config: ClientConfig) {
    const knowledgeGraphConfig = config.knowledgeGraph;
    const serverStarted = await this.#knowledgeGraphManager.startServer(knowledgeGraphConfig);

    if (!serverStarted) {
      return;
    }

    await this.handleWorkspaceFoldersChange(config.workspaceFolders ?? []);
  }

  async handleWorkspaceFoldersChange(workspaceFolders: WorkspaceFolder[]) {
    const client = this.#knowledgeGraphManager.getClient();

    if (!client) {
      this.#logger.debug('Knowledge Graph client is not available.');
      return;
    }

    const newWorkspaceFolders = workspaceFolders.filter(
      (folder) => !this.#workspaceFolders.some((f) => f.uri === folder.uri),
    );

    await Promise.all([...newWorkspaceFolders.map((folder) => client.index(folder.uri))]);

    this.#workspaceFolders = workspaceFolders;
  }

  async #handleProjectCacheUpdate(projectsMap: Map<string, DuoProject[]>) {
    const client = this.#knowledgeGraphManager.getClient();

    if (!client) {
      this.#logger.debug('Knowledge Graph client is not available for context exclusion update.');
      return;
    }

    const allProjects = Array.from(projectsMap.values()).flat();

    await Promise.all(
      allProjects.map(async (project) => {
        const { uri, exclusionRules } = project;

        // Convert URI to absolute filesystem path and remove /.git/config
        const projectPath = this.#duoProjectAccessCache.getProjectFSPathFromUri(uri);
        const previousRules = this.#projectExclusionRules.get(projectPath);

        // Only update if exclusion rules have changed
        if (!isEqual(previousRules, exclusionRules)) {
          this.#logger.debug(
            `Exclusion rules changed for project ${projectPath}. Updating Knowledge Graph.`,
          );

          await client.updateContextExclusion(projectPath, exclusionRules);
          this.#projectExclusionRules.set(projectPath, exclusionRules);
        }
      }),
    );
  }
}
