import { gql } from 'graphql-request';
import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ApiRequest, tryParseGitLabGid } from '@gitlab-org/core';
import { WorkspaceFolder, URI } from 'vscode-languageserver-protocol';
import { ConfigService } from '@gitlab-org/config';
import { CompositeDisposable, Disposable } from '@gitlab-org/disposable';
import {
  DocumentService,
  GitLabApiClient,
  type DuoProject,
  DuoWorkspaceProjectAccessCache,
  TextDocumentChangeListenerType,
  Project,
  ProjectService,
} from '@gitlab-org/legacy-common';

const GET_PROJECT_ID_QUERY = gql`
  query getProject($projectPath: ID!) {
    project(fullPath: $projectPath) {
      id
    }
  }
`;

type ProjectPath = string;

interface ProjectIdResponse {
  project: {
    id: string;
  };
}

@Injectable(ProjectService, [
  GitLabApiClient,
  Logger,
  DocumentService,
  DuoWorkspaceProjectAccessCache,
  ConfigService,
])
export class NodeProjectService implements ProjectService, Disposable {
  #api: GitLabApiClient;

  #logger: Logger;

  #projectIdCache = new Map<ProjectPath, number>();

  #fileURIToProject = new Map<URI, Project>();

  /**
   * URI of the document in the active editor. We track it so we can (re)resolve its
   * project once the DuoWorkspaceProjectAccessCache is populated. The access cache is
   * filled reactively from workspace scan events, so a document made active before the
   * scan completes would otherwise never get a project resolved while it stays active
   * (no further `onDidSetActive` fires for it).
   */
  #activeDocumentURI?: URI;

  #projectAccessCache: DuoWorkspaceProjectAccessCache;

  #configService: ConfigService;

  #documentService: DocumentService;

  #disposables = new CompositeDisposable();

  constructor(
    api: GitLabApiClient,
    logger: Logger,
    documentService: DocumentService,
    projectAccessCache: DuoWorkspaceProjectAccessCache,
    configService: ConfigService,
  ) {
    this.#api = api;
    this.#logger = withPrefix(logger, '[ProjectService]');

    this.#projectAccessCache = projectAccessCache;
    this.#configService = configService;
    this.#documentService = documentService;

    this.#disposables.add(
      this.#documentService.onDocumentChange(this.#handleDocumentChange.bind(this)),
    );

    // The access cache is populated asynchronously from workspace scan events, which
    // can complete after a document is made active. Re-resolve the active document when
    // the cache updates so its project (and namespace) can still be attributed without
    // blocking the telemetry/suggestion path.
    this.#disposables.add(
      this.#projectAccessCache.onDuoProjectCacheUpdate(() => {
        if (!this.#activeDocumentURI) return;

        this.#resolveProjectForURI(this.#activeDocumentURI).catch((error) => {
          this.#logger.debug(`Failed to resolve project after project access cache update`, error);
        });
      }),
    );
  }

  async #handleDocumentChange(
    event: { document: { uri: URI } },
    handlerType: TextDocumentChangeListenerType,
  ): Promise<void> {
    if (
      handlerType !== TextDocumentChangeListenerType.onDidSetActive &&
      handlerType !== TextDocumentChangeListenerType.onDidOpen
    ) {
      return;
    }

    if (handlerType === TextDocumentChangeListenerType.onDidSetActive) {
      this.#activeDocumentURI = event.document.uri;
    }

    if (await this.getProjectByFileURI(event.document.uri)) return;

    await this.#resolveProjectForURI(event.document.uri);
  }

  /**
   * Resolves and caches the GitLab project for a document URI from the access cache.
   * Safe to call repeatedly: it is a no-op if the project is already resolved, and
   * it leaves the URI unresolved (for a later retry) if the cache is not yet populated.
   */
  async #resolveProjectForURI(uri: URI): Promise<void> {
    if (this.#fileURIToProject.has(uri)) return;

    const workspaceFolder = await this.#getWorkspaceFolderForUri(uri);

    if (!workspaceFolder) {
      return;
    }

    const duoProjects = this.#projectAccessCache.getProjectsForWorkspaceFolder(workspaceFolder);
    const duoProject =
      duoProjects.length > 1
        ? this.#findDeepestProjectByPath(uri, duoProjects)
        : (duoProjects[0] ?? null);

    if (!duoProject) {
      return;
    }

    const projectId = await this.#getProjectIdFromPath(duoProject.namespaceWithPath);
    if (projectId) {
      const project: Project = {
        id: projectId,
        uri: duoProject.uri,
        namespaceWithPath: duoProject.namespaceWithPath,
      };
      this.#fileURIToProject.set(uri, project);
    }
  }

  async getProjectByFileURI(uri: URI): Promise<Project | undefined> {
    return this.#fileURIToProject.get(uri);
  }

  #findDeepestProjectByPath(uri: string, projects: DuoProject[]): DuoProject | undefined {
    let deepestProject: DuoProject | undefined;
    for (const project of projects) {
      if (uri.startsWith(project.uri.replace('.git/config', ''))) {
        if (!deepestProject || project.uri.length > deepestProject.uri.length) {
          deepestProject = project;
        }
      }
    }

    return deepestProject;
  }

  async #getWorkspaceFolderForUri(uri: URI): Promise<WorkspaceFolder | undefined> {
    const workspaceFolders = await this.#configService?.get('workspaceFolders');

    return workspaceFolders?.find((folder) => uri.startsWith(folder.uri));
  }

  dispose(): void {
    this.#disposables.dispose();
  }

  async #getProjectIdFromPath(projectPath: string): Promise<number | undefined> {
    if (this.#projectIdCache.has(projectPath)) {
      return this.#projectIdCache.get(projectPath);
    }

    try {
      const response = await this.#api.fetchFromApi<ProjectIdResponse>({
        type: 'graphql',
        query: GET_PROJECT_ID_QUERY,
        variables: {
          projectPath,
        },
      } as ApiRequest<ProjectIdResponse>);

      if (response?.project?.id) {
        const projectId = tryParseGitLabGid(response.project.id);
        if (projectId) {
          this.#projectIdCache.set(projectPath, projectId);
          return projectId;
        }
      }
    } catch (error) {
      this.#logger.warn(`Failed to get project ID for path: ${projectPath}`, error);
    }

    return undefined;
  }
}
