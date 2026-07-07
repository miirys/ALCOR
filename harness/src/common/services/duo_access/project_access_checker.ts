import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { GitLabProjectId } from '../../api_types';
import { DuoApiProjectAccessCache } from './api_project_access_cache';
import { DuoProject, DuoWorkspaceProjectAccessCache } from './workspace_project_access_cache';

export enum DuoProjectStatus {
  DuoEnabled = 'duo-enabled',
  DuoDisabled = 'duo-disabled',
  NonGitlabProject = 'non-gitlab-project',
}

export interface DuoProjectAccessChecker {
  checkProjectStatus(
    uri: string,
    workspaceFolder: WorkspaceFolder,
  ): {
    project?: DuoProject;
    status: DuoProjectStatus;
  };
  checkProjectStatusesByIds(
    projectIds: GitLabProjectId[],
  ): Promise<Record<GitLabProjectId, DuoProjectStatus>>;
}

export const DuoProjectAccessChecker =
  createInterfaceId<DuoProjectAccessChecker>('DuoProjectAccessChecker');

@Injectable(DuoProjectAccessChecker, [DuoWorkspaceProjectAccessCache, DuoApiProjectAccessCache])
export class DefaultDuoProjectAccessChecker {
  #projectAccessCache: DuoWorkspaceProjectAccessCache;

  #apiProjectAccessCache: DuoApiProjectAccessCache;

  constructor(
    projectAccessCache: DuoWorkspaceProjectAccessCache,
    apiProjectAccessCache: DuoApiProjectAccessCache,
  ) {
    this.#projectAccessCache = projectAccessCache;
    this.#apiProjectAccessCache = apiProjectAccessCache;
  }

  /**
   * Check if Duo features are enabled for a given DocumentUri.
   *
   * We match the DocumentUri to the project with the longest path.
   * The enabled projects come from the `DuoWorkspaceProjectAccessCache`.
   *
   * @reference `DocumentUri` is the URI of the document to check. Comes from
   * the `TextDocument` object.
   */
  checkProjectStatus(
    uri: string,
    workspaceFolder: WorkspaceFolder,
  ): {
    project?: DuoProject;
    status: DuoProjectStatus;
  } {
    const projects = this.#projectAccessCache.getProjectsForWorkspaceFolder(workspaceFolder);
    if (projects.length === 0) {
      return { status: DuoProjectStatus.NonGitlabProject };
    }
    const project = this.#findDeepestProjectByPath(uri, projects);

    if (!project) {
      return { status: DuoProjectStatus.NonGitlabProject };
    }
    return {
      project,
      status: project.enabled ? DuoProjectStatus.DuoEnabled : DuoProjectStatus.DuoDisabled,
    };
  }

  /**
   * Check if Duo features are enabled for a given project ID.
   *
   * The DuoApiProjectAccessCache should be pre-populated before calling this.
   */
  async checkProjectStatusesByIds(
    projectIds: GitLabProjectId[],
  ): Promise<Record<GitLabProjectId, DuoProjectStatus>> {
    const statuses = await this.#apiProjectAccessCache.getEnabledForProjects(projectIds);
    return projectIds.reduce(
      (acc, projectId) => {
        return {
          ...acc,
          [projectId]: statuses[projectId]
            ? DuoProjectStatus.DuoEnabled
            : DuoProjectStatus.DuoDisabled,
        };
      },
      {} as Record<GitLabProjectId, DuoProjectStatus>,
    );
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
}
