import { TestLogger, Logger } from '@gitlab-org/logging';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocumentChangeEvent } from 'vscode-languageserver';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DefaultConfigService } from '@gitlab-org/config';
import {
  GitLabApiClient,
  DocumentService,
  DuoWorkspaceProjectAccessCache,
  type DuoProject,
  TextDocumentChangeListenerType,
} from '@gitlab-org/legacy-common';
import { NodeProjectService } from './node_project_service';

describe('NodeProjectService', () => {
  let projectService: NodeProjectService;
  let apiClient: GitLabApiClient;
  let logger: Logger;
  let documentService: DocumentService;
  let projectAccessCache: DuoWorkspaceProjectAccessCache;
  let configService: DefaultConfigService;
  let workspaceFolder: WorkspaceFolder;
  let mockProject: DuoProject;
  let triggerProjectCacheUpdate: () => void;

  const uri = 'file:///path/to/project/file.ts';
  const projectPath = 'gitlab-org/project';
  const projectId = 123;

  beforeEach(() => {
    apiClient = createFakePartial<GitLabApiClient>({
      fetchFromApi: jest.fn(),
    });

    logger = new TestLogger();
    jest.spyOn(logger, 'warn');

    documentService = createFakePartial<DocumentService>({
      onDocumentChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    });

    triggerProjectCacheUpdate = () => {};
    projectAccessCache = createFakePartial<DuoWorkspaceProjectAccessCache>({
      getProjectsForWorkspaceFolder: jest.fn(),
      onDuoProjectCacheUpdate: jest.fn().mockImplementation((listener: () => void) => {
        triggerProjectCacheUpdate = listener;
        return { dispose: jest.fn() };
      }),
    });

    configService = new DefaultConfigService();

    workspaceFolder = {
      uri: 'file:///path/to/project',
      name: 'project',
    };

    mockProject = {
      projectPath,
      uri: 'file:///path/to/project/.git/config',
      enabled: true,
      host: 'gitlab.com',
      namespace: 'gitlab-org',
      namespaceWithPath: 'gitlab-org/project',
      exclusionRules: [],
      remoteName: 'origin',
    };

    projectService = new NodeProjectService(
      apiClient,
      logger,
      documentService,
      projectAccessCache,
      configService,
    );
  });

  const createMockDocumentAndEvent = (documentUri = uri) => {
    const mockDocument = createFakePartial<TextDocument>({
      uri: documentUri,
    });

    return {
      mockDocument,
      mockEvent: {
        document: mockDocument,
      } as TextDocumentChangeEvent<TextDocument>,
    };
  };

  const setupCommonMocks = (
    options: {
      includeWorkspace?: boolean;
      includeProjects?: boolean;
      projectIdValue?: number;
      apiSuccess?: boolean;
    } = {},
  ) => {
    const {
      includeWorkspace = true,
      includeProjects = true,
      projectIdValue = projectId,
      apiSuccess = true,
    } = options;

    if (includeWorkspace) {
      jest.spyOn(configService, 'get').mockReturnValue([workspaceFolder] as unknown as undefined);
    }

    if (includeProjects) {
      jest.mocked(projectAccessCache.getProjectsForWorkspaceFolder).mockReturnValue([mockProject]);
    } else {
      jest.mocked(projectAccessCache.getProjectsForWorkspaceFolder).mockReturnValue([]);
    }

    if (apiSuccess) {
      jest.mocked(apiClient.fetchFromApi).mockResolvedValue({
        project: { id: `gid://gitlab/Project/${projectIdValue}` },
      });
    } else {
      jest.mocked(apiClient.fetchFromApi).mockRejectedValue(new Error('API error'));
    }
  };

  const triggerDocumentChange = async (documentUri = uri) => {
    const { mockEvent } = createMockDocumentAndEvent(documentUri);
    const changeHandler = jest.mocked(documentService.onDocumentChange).mock.calls[0][0];
    await changeHandler(mockEvent, TextDocumentChangeListenerType.onDidSetActive);
  };

  describe('project caching', () => {
    it('caches project after fetching from API', async () => {
      const { mockEvent } = createMockDocumentAndEvent();
      setupCommonMocks();

      const changeHandler = jest.mocked(documentService.onDocumentChange).mock.calls[0][0];
      await changeHandler(mockEvent, TextDocumentChangeListenerType.onDidSetActive);

      const project = await projectService.getProjectByFileURI(uri);
      expect(project).toBeDefined();
      expect(project?.id).toBe(projectId);
      expect(apiClient.fetchFromApi).toHaveBeenCalledTimes(1);

      jest.mocked(apiClient.fetchFromApi).mockClear();

      await changeHandler(mockEvent, TextDocumentChangeListenerType.onDidSetActive);

      expect(apiClient.fetchFromApi).not.toHaveBeenCalled();
      expect(await projectService.getProjectByFileURI(uri)).toEqual(
        expect.objectContaining({
          id: projectId,
          namespaceWithPath: mockProject.namespaceWithPath,
        }),
      );
    });

    it('fetches project from API when not in cache', async () => {
      setupCommonMocks();
      await triggerDocumentChange();

      expect(apiClient.fetchFromApi).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: { projectPath },
        }),
      );

      const project = await projectService.getProjectByFileURI(uri);
      expect(project).toBeDefined();
      expect(project?.id).toBe(projectId);
    });

    it('handles API errors gracefully during document change', async () => {
      setupCommonMocks({ apiSuccess: false });
      await triggerDocumentChange();

      expect(logger.warn).toHaveBeenCalled();
      expect(await projectService.getProjectByFileURI(uri)).toBeUndefined();
    });

    it('handles missing project ID in API response', async () => {
      jest.spyOn(configService, 'get').mockReturnValue([workspaceFolder] as unknown as undefined);
      jest.mocked(projectAccessCache.getProjectsForWorkspaceFolder).mockReturnValue([mockProject]);
      jest.mocked(apiClient.fetchFromApi).mockResolvedValue({
        project: { id: null },
      });

      await triggerDocumentChange();

      expect(await projectService.getProjectByFileURI(uri)).toBeUndefined();
    });
  });

  describe('document change handler', () => {
    it('handles missing workspace folder', async () => {
      setupCommonMocks({ includeWorkspace: false });
      await triggerDocumentChange();

      expect(projectAccessCache.getProjectsForWorkspaceFolder).not.toHaveBeenCalled();
      expect(apiClient.fetchFromApi).not.toHaveBeenCalled();
    });

    it('handles empty projects in workspace folder', async () => {
      setupCommonMocks({ includeProjects: false });
      await triggerDocumentChange();

      expect(apiClient.fetchFromApi).not.toHaveBeenCalled();
    });
  });

  describe('getProjectByFileURI', () => {
    it('returns undefined for unknown URI', async () => {
      const unknownUri = 'file:///unknown/file.ts';
      const result = await projectService.getProjectByFileURI(unknownUri);
      expect(result).toBeUndefined();
    });

    it('returns project for URI after document change', async () => {
      setupCommonMocks();
      await triggerDocumentChange();

      const result = await projectService.getProjectByFileURI(uri);
      expect(result).toBeDefined();
      expect(result?.id).toBe(projectId);
      expect(result?.namespaceWithPath).toBe(mockProject.namespaceWithPath);
    });
  });

  describe('project access cache update', () => {
    it('resolves the active document when the access cache is populated later', async () => {
      // Document becomes active before the access cache is populated (scan not finished yet).
      setupCommonMocks({ includeProjects: false });
      await triggerDocumentChange();

      expect(await projectService.getProjectByFileURI(uri)).toBeUndefined();
      expect(apiClient.fetchFromApi).not.toHaveBeenCalled();

      // Access cache becomes populated and fires an update.
      jest.mocked(projectAccessCache.getProjectsForWorkspaceFolder).mockReturnValue([mockProject]);
      jest.mocked(apiClient.fetchFromApi).mockResolvedValue({
        project: { id: `gid://gitlab/Project/${projectId}` },
      });

      triggerProjectCacheUpdate();
      await new Promise(process.nextTick);

      const result = await projectService.getProjectByFileURI(uri);
      expect(result).toBeDefined();
      expect(result?.id).toBe(projectId);
      expect(result?.namespaceWithPath).toBe(mockProject.namespaceWithPath);
    });

    it('does not re-resolve the active document when it is already resolved', async () => {
      setupCommonMocks();
      await triggerDocumentChange();

      expect(apiClient.fetchFromApi).toHaveBeenCalledTimes(1);
      jest.mocked(apiClient.fetchFromApi).mockClear();

      triggerProjectCacheUpdate();
      await new Promise(process.nextTick);

      expect(apiClient.fetchFromApi).not.toHaveBeenCalled();
    });

    it('does nothing when there is no active document', async () => {
      // Only an onDidOpen event (no active document set).
      setupCommonMocks({ includeProjects: false });
      const { mockEvent } = createMockDocumentAndEvent();
      const changeHandler = jest.mocked(documentService.onDocumentChange).mock.calls[0][0];
      await changeHandler(mockEvent, TextDocumentChangeListenerType.onDidOpen);

      jest.mocked(apiClient.fetchFromApi).mockClear();
      jest.mocked(projectAccessCache.getProjectsForWorkspaceFolder).mockReturnValue([mockProject]);

      triggerProjectCacheUpdate();
      await new Promise(process.nextTick);

      expect(apiClient.fetchFromApi).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('disposes all subscriptions', () => {
      const documentChangeDisposable = { dispose: jest.fn() };
      const cacheUpdateDisposable = { dispose: jest.fn() };

      jest.mocked(documentService.onDocumentChange).mockReturnValue(documentChangeDisposable);
      jest
        .mocked(projectAccessCache.onDuoProjectCacheUpdate)
        .mockReturnValue(cacheUpdateDisposable);

      const service = new NodeProjectService(
        apiClient,
        logger,
        documentService,
        projectAccessCache,
        configService,
      );

      service.dispose();

      expect(documentChangeDisposable.dispose).toHaveBeenCalled();
      expect(cacheUpdateDisposable.dispose).toHaveBeenCalled();
    });
  });
});
