import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DuoApiProjectAccessCache } from './api_project_access_cache';
import { DuoProject, DuoWorkspaceProjectAccessCache } from './workspace_project_access_cache';
import {
  DefaultDuoProjectAccessChecker,
  DuoProjectAccessChecker,
  DuoProjectStatus,
} from './project_access_checker';

describe('DuoProjectAccessChecker', () => {
  let projectAccessCache: DuoWorkspaceProjectAccessCache;
  let apiProjectAccessCache: DuoApiProjectAccessCache;
  let accessChecker: DuoProjectAccessChecker;

  beforeEach(() => {
    projectAccessCache = createFakePartial<DuoWorkspaceProjectAccessCache>({
      getProjectsForWorkspaceFolder: jest.fn(),
    });
    apiProjectAccessCache = createFakePartial<DuoApiProjectAccessCache>({
      getEnabledForProjects: jest.fn(),
    });
    accessChecker = new DefaultDuoProjectAccessChecker(projectAccessCache, apiProjectAccessCache);
  });

  describe('checkProjectStatus', () => {
    it('should return "non-gitlab-project" if no projects are found for the workspace folder', () => {
      const uri = 'file:///path/to/file.txt';
      const workspaceFolder: WorkspaceFolder = createFakePartial<WorkspaceFolder>({
        uri: 'file:///path/to/workspace',
      });

      jest.mocked(projectAccessCache.getProjectsForWorkspaceFolder).mockReturnValueOnce([]);

      const result = accessChecker.checkProjectStatus(uri, workspaceFolder);

      expect(result).toEqual({
        status: DuoProjectStatus.NonGitlabProject,
        project: undefined,
      });
      expect(projectAccessCache.getProjectsForWorkspaceFolder).toHaveBeenCalledWith(
        workspaceFolder,
      );
    });

    it('should return "non-gitlab-project"  if no matching project is found for the URI', () => {
      const uri = 'file:///path/to/file.txt';
      const workspaceFolder: WorkspaceFolder = createFakePartial<WorkspaceFolder>({
        uri: 'file:///path/to/workspace',
      });
      const projects: DuoProject[] = [
        createFakePartial<DuoProject>({
          uri: 'file:///path/to/project1/.git/config',
          enabled: true,
          exclusionRules: [],
        }),
        createFakePartial<DuoProject>({
          uri: 'file:///path/to/project2/.git/config',
          enabled: false,
          exclusionRules: [],
        }),
      ];

      jest.mocked(projectAccessCache.getProjectsForWorkspaceFolder).mockReturnValueOnce(projects);

      const result = accessChecker.checkProjectStatus(uri, workspaceFolder);

      expect(result).toEqual({
        status: DuoProjectStatus.NonGitlabProject,
        project: undefined,
      });
      expect(projectAccessCache.getProjectsForWorkspaceFolder).toHaveBeenCalledWith(
        workspaceFolder,
      );
    });

    it('should return "duo-enabled" if a matching project with Duo features enabled is found for the URI', () => {
      const uri = 'file:///path/to/project1/src/file.txt';
      const workspaceFolder: WorkspaceFolder = createFakePartial<WorkspaceFolder>({
        uri: 'file:///path/to/workspace',
      });
      const projects: DuoProject[] = [
        createFakePartial<DuoProject>({
          uri: 'file:///path/to/project1/.git/config',
          enabled: true,
          exclusionRules: [],
        }),
        createFakePartial<DuoProject>({
          uri: 'file:///path/to/project2/.git/config',
          enabled: false,
          exclusionRules: [],
        }),
      ];

      jest.mocked(projectAccessCache.getProjectsForWorkspaceFolder).mockReturnValueOnce(projects);

      const result = accessChecker.checkProjectStatus(uri, workspaceFolder);

      expect(result).toEqual({
        status: DuoProjectStatus.DuoEnabled,
        project: projects[0],
      });
      expect(projectAccessCache.getProjectsForWorkspaceFolder).toHaveBeenCalledWith(
        workspaceFolder,
      );
    });

    it('should return "duo-disabled" if a matching project with Duo features disabled is found for the URI', () => {
      const uri = 'file:///path/to/project2/src/file.txt';
      const workspaceFolder: WorkspaceFolder = createFakePartial<WorkspaceFolder>({
        uri: 'file:///path/to/workspace',
      });
      const projects: DuoProject[] = [
        createFakePartial<DuoProject>({
          uri: 'file:///path/to/project1/.git/config',
          enabled: true,
          exclusionRules: [],
        }),
        createFakePartial<DuoProject>({
          uri: 'file:///path/to/project2/.git/config',
          enabled: false,
          exclusionRules: [],
        }),
      ];

      jest.mocked(projectAccessCache.getProjectsForWorkspaceFolder).mockReturnValueOnce(projects);

      const result = accessChecker.checkProjectStatus(uri, workspaceFolder);

      expect(result).toEqual({
        status: DuoProjectStatus.DuoDisabled,
        project: projects[1],
      });
      expect(projectAccessCache.getProjectsForWorkspaceFolder).toHaveBeenCalledWith(
        workspaceFolder,
      );
    });

    it('should return "duo-enabled" if the URI matches the deepest project with Duo features enabled', () => {
      const uri = 'file:///path/to/project1/nested/src/file.txt';
      const workspaceFolder: WorkspaceFolder = createFakePartial<WorkspaceFolder>({
        uri: 'file:///path/to/workspace',
      });
      const projects: DuoProject[] = [
        createFakePartial<DuoProject>({
          uri: 'file:///path/to/project1/.git/config',
          enabled: false,
          exclusionRules: [],
        }),
        createFakePartial<DuoProject>({
          uri: 'file:///path/to/project1/nested/.git/config',
          enabled: true,
          exclusionRules: [],
        }),
      ];

      jest.mocked(projectAccessCache.getProjectsForWorkspaceFolder).mockReturnValueOnce(projects);

      const result = accessChecker.checkProjectStatus(uri, workspaceFolder);

      expect(result).toEqual({
        status: DuoProjectStatus.DuoEnabled,
        project: projects[1],
      });
      expect(projectAccessCache.getProjectsForWorkspaceFolder).toHaveBeenCalledWith(
        workspaceFolder,
      );
    });
  });

  describe('checkProjectStatusesByIds', () => {
    it('should return DuoEnabled for a project with Duo enabled', async () => {
      const projectId = 123;
      jest
        .mocked(apiProjectAccessCache.getEnabledForProjects)
        .mockResolvedValue({ [projectId]: true });

      const result = await accessChecker.checkProjectStatusesByIds([projectId]);

      expect(result).toEqual({ [projectId]: DuoProjectStatus.DuoEnabled });
    });

    it('should return DuoDisabled for a project with Duo disabled', async () => {
      const projectId = 456;
      jest
        .mocked(apiProjectAccessCache.getEnabledForProjects)
        .mockResolvedValue({ [projectId]: false });

      const result = await accessChecker.checkProjectStatusesByIds([projectId]);

      expect(result).toEqual({ [projectId]: DuoProjectStatus.DuoDisabled });
    });

    it('should return expected for multiple projects', async () => {
      jest.mocked(apiProjectAccessCache.getEnabledForProjects).mockResolvedValue({
        123: true,
        456: false,
        789: true,
      });

      const result = await accessChecker.checkProjectStatusesByIds([123, 456, 789]);

      expect(result).toEqual({
        123: DuoProjectStatus.DuoEnabled,
        456: DuoProjectStatus.DuoDisabled,
        789: DuoProjectStatus.DuoEnabled,
      });
    });
  });

  it('should handle multiple workspaceFolders and nested projects correctly', () => {
    const uri = 'file:///path/to/project1/nested/src/file.txt';
    const workspaceFolder: WorkspaceFolder = createFakePartial<WorkspaceFolder>({
      uri: 'file:///path/to/workspace',
    });
    const workspaceFolder2: WorkspaceFolder = createFakePartial<WorkspaceFolder>({
      uri: 'file:///path/to/workspace2',
    });

    const projects: DuoProject[] = [
      createFakePartial<DuoProject>({
        uri: 'file:///path/to/project1/.git/config',
        enabled: false,
        exclusionRules: [],
      }),
      createFakePartial<DuoProject>({
        uri: 'file:///path/to/project1/nested/.git/config',
        enabled: true,
        exclusionRules: [],
      }),
    ];
    const projects2: DuoProject[] = [
      createFakePartial<DuoProject>({
        uri: 'file:///path/to/project2/.git/config',
        enabled: true,
        exclusionRules: [],
      }),
    ];

    jest
      .mocked(projectAccessCache.getProjectsForWorkspaceFolder)
      .mockReturnValueOnce(projects)
      .mockReturnValueOnce(projects2);

    const result = accessChecker.checkProjectStatus(uri, workspaceFolder);
    expect(result).toEqual({
      status: DuoProjectStatus.DuoEnabled,
      project: projects[1],
    });

    const result2 = accessChecker.checkProjectStatus(uri, workspaceFolder2);
    expect(result2).toEqual({
      status: DuoProjectStatus.NonGitlabProject,
      project: undefined,
    });
  });
});
