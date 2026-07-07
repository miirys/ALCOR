import { WorkspaceFolder } from 'vscode-languageserver';
import { Disposable } from '@gitlab-org/disposable';
import { AbortError } from '@gitlab-org/resiliency';
import { createFakePartial } from '@gitlab-org/test-utils';
import { AGENTIC_CHAT_NO_SUPPORT, GitLabApiService, UserService } from '@gitlab-org/core';
import { TestLogger, Logger } from '@gitlab-org/logging';
import { ConfigService, DefaultConfigService } from '@gitlab-org/config';
import { InvalidInstanceVersionError } from '@gitlab-org/fetch';
import { DuoWorkspaceProjectAccessCache } from '../../services/duo_access';
import { DuoProject } from '../../services/duo_access/workspace_project_access_cache';
import {
  DefaultAgenticChatSupportCheck,
  GqlAgenticChatAvailable,
} from './agentic_chat_support_check';

jest.mock('../../services/duo_access');

jest.mock('@gitlab-org/resiliency', () => ({
  ...jest.requireActual('@gitlab-org/resiliency'),
  retry: jest.fn((fn) => fn),
  isNotAbort: jest.fn(() => true),
}));

describe('AgenticChatSupportCheck', () => {
  const disposables: Disposable[] = [];
  let mockApiService: GitLabApiService;
  let mockConfigService: ConfigService;
  let mockProjectAccessCache: DuoWorkspaceProjectAccessCache;
  let mockUserService: UserService;
  let logger: Logger;
  let agenticChatSupportCheck: DefaultAgenticChatSupportCheck;
  let mockDuoProjectCacheUpdateListener: (data: DuoProject[], signal: AbortSignal) => void;
  let debugLogSpy: jest.SpyInstance;
  let errorLogSpy: jest.SpyInstance;

  const expectDebugLogToBeCalledWith = (substr: string) => {
    if (debugLogSpy) {
      expect(debugLogSpy).toHaveBeenCalledWith(expect.stringContaining(substr), undefined);
    }
  };
  const expectErrorLogToBeCalledWith = (substr: string) => {
    if (errorLogSpy) {
      expect(errorLogSpy).toHaveBeenCalledWith(expect.stringContaining(substr), expect.any(Error));
    }
  };

  const mockWorkspaceFolder: WorkspaceFolder = {
    uri: 'file:///test/workspace',
    name: 'test',
  };

  const mockWorkspaceFolder1: WorkspaceFolder = {
    uri: 'file:///test/workspace1',
    name: 'test1',
  };

  const mockWorkspaceFolder2: WorkspaceFolder = {
    uri: 'file:///test/workspace2',
    name: 'test2',
  };

  const mockProject: DuoProject = createFakePartial<DuoProject>({
    namespaceWithPath: 'test/project',
  });

  const mockProject1: DuoProject = createFakePartial<DuoProject>({
    namespaceWithPath: 'test/project1',
  });

  const mockProject2: DuoProject = createFakePartial<DuoProject>({
    namespaceWithPath: 'test/project2',
  });

  const initialProject: DuoProject = createFakePartial<DuoProject>({
    namespaceWithPath: 'initial/project',
  });

  const newProject: DuoProject = createFakePartial<DuoProject>({
    namespaceWithPath: 'new/project',
  });

  const createAgenticChatSupportCheck = () => {
    return new DefaultAgenticChatSupportCheck(
      mockApiService,
      mockConfigService,
      mockProjectAccessCache,
      logger,
      mockUserService,
    );
  };

  const fetchOperation = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();

    mockApiService = createFakePartial<GitLabApiService>({
      fetchOperation,
    });

    mockProjectAccessCache = createFakePartial<DuoWorkspaceProjectAccessCache>({
      onDuoProjectCacheUpdate: jest.fn().mockImplementation((listener) => {
        mockDuoProjectCacheUpdateListener = listener;
        return createFakePartial<Disposable>({ dispose: jest.fn() });
      }),
      getProjectsForWorkspaceFolder: jest.fn().mockReturnValue([]),
    });

    mockConfigService = new DefaultConfigService();
    mockConfigService.set('duo.agentPlatform.enabled', true);

    mockUserService = createFakePartial<UserService>({
      getUser: jest.fn().mockResolvedValue({
        id: 'gid://gitlab/User/1',
        restId: 1,
        username: 'test-user',
        name: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        duoDefaultNamespacePath: undefined,
      }),
    });

    logger = new TestLogger();

    debugLogSpy = jest.spyOn(logger, 'debug');
    errorLogSpy = jest.spyOn(logger, 'error');
  });

  afterEach(() => {
    while (disposables.length > 0) {
      disposables.pop()!.dispose();
    }
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize AgenticChatSupportCheck correctly', async () => {
      mockConfigService.set('workspaceFolders', undefined);

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      expect(agenticChatSupportCheck.id).toBe(AGENTIC_CHAT_NO_SUPPORT);
      expect(mockProjectAccessCache.onDuoProjectCacheUpdate).toHaveBeenCalledWith(
        expect.any(Function),
      );

      await jest.runAllTimersAsync();

      expect(agenticChatSupportCheck.engaged).toBe(true);
      expect(agenticChatSupportCheck.details).toBe(
        'Agentic Chat is not supported. Ensure at least one of your projects has access or configure a default namespace in user settings.',
      );
    });
  });

  describe('details getter', () => {
    it('should return chat is supported message when not engaged', async () => {
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: true },
      });

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expect(agenticChatSupportCheck.engaged).toBe(false);
      expect(agenticChatSupportCheck.details).toBe(
        'Agentic Chat is supported. One of your projects has access or a default namespace is configured in user settings.',
      );
    });

    it('should return not supported message when engaged', async () => {
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: false },
      });

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expect(agenticChatSupportCheck.engaged).toBe(true);
      expect(agenticChatSupportCheck.details).toBe(
        'Agentic Chat is not supported. Ensure at least one of your projects has access or configure a default namespace in user settings.',
      );
    });
  });

  describe('API interaction', () => {
    it('should make correct GraphQL query for project', async () => {
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: true },
      });

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expect(mockApiService.fetchOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'graphql',
          variables: { projectPath: 'test/project' },
          supportedSinceInstanceVersion: {
            version: '18.1.0',
            resourceName: 'get project Duo Agentic Chat support',
          },
        }),
      );
    });

    it('should handle API errors gracefully', async () => {
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      jest.mocked(fetchOperation).mockRejectedValue(new Error('API Error'));

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expect(agenticChatSupportCheck.engaged).toBe(true);
      expectErrorLogToBeCalledWith('Failed to request Agentic Chat availability');
    });

    it('should handle InvalidInstanceVersionError', async () => {
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      jest.mocked(fetchOperation).mockRejectedValue(new InvalidInstanceVersionError('Too old'));

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expect(agenticChatSupportCheck.engaged).toBe(true);
    });

    it('should handle AbortError', async () => {
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      jest.mocked(fetchOperation).mockRejectedValue(new AbortError('Aborted'));

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expect(agenticChatSupportCheck.engaged).toBe(true);
      expectDebugLogToBeCalledWith('Request aborted for project');
    });

    it('should handle missing duoAgenticChatAvailable field', async () => {
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      jest.mocked(fetchOperation).mockResolvedValue({
        project: {},
      });

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expect(agenticChatSupportCheck.engaged).toBe(true);
    });

    it('should handle null project response', async () => {
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      // API returns null project
      jest.mocked(fetchOperation).mockResolvedValue({
        project: null,
      });

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expect(agenticChatSupportCheck.engaged).toBe(true);
    });
  });

  describe('onChanged', () => {
    it('should emit events when chat availability changes', async () => {
      const mockListener = jest.fn();

      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: false },
      });

      agenticChatSupportCheck = createAgenticChatSupportCheck();
      const disposable = agenticChatSupportCheck.onChanged(mockListener);

      await jest.runAllTimersAsync();

      expect(mockListener.mock.calls[0][0]).toEqual(
        expect.objectContaining({ checkId: agenticChatSupportCheck.id, engaged: true }),
      );
      expect(mockListener.mock.calls[0][1]).toBeInstanceOf(AbortSignal);

      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: true },
      });

      const newSignal = new AbortController().signal;
      mockDuoProjectCacheUpdateListener([], newSignal);

      jest.advanceTimersByTime(500);
      await jest.runAllTimersAsync();

      expect(mockListener).toHaveBeenCalledTimes(2);

      expect(mockListener.mock.calls[1][0]).toEqual(
        expect.objectContaining({ checkId: agenticChatSupportCheck.id, engaged: false }),
      );

      disposable.dispose();
    });

    it('should not emit events when availability does not change', async () => {
      const mockListener = jest.fn();

      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: true },
      });

      agenticChatSupportCheck = createAgenticChatSupportCheck();
      agenticChatSupportCheck.onChanged(mockListener);

      await jest.runAllTimersAsync();

      const initialCallCount = mockListener.mock.calls.length;

      mockDuoProjectCacheUpdateListener([], new AbortController().signal);

      jest.advanceTimersByTime(500);
      await jest.runAllTimersAsync();

      expect(mockListener).toHaveBeenCalledTimes(initialCallCount);
    });

    it('should handle multiple listeners', async () => {
      const mockListener1 = jest.fn();
      const mockListener2 = jest.fn();

      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      // Start with false so it changes to true and emits event
      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: false },
      });

      agenticChatSupportCheck = createAgenticChatSupportCheck();
      agenticChatSupportCheck.onChanged(mockListener1);
      agenticChatSupportCheck.onChanged(mockListener2);

      await jest.runAllTimersAsync();

      expect(mockListener1.mock.calls[0][0]).toEqual(
        expect.objectContaining({ checkId: agenticChatSupportCheck.id, engaged: true }),
      );
      expect(mockListener2.mock.calls[0][0]).toEqual(
        expect.objectContaining({ checkId: agenticChatSupportCheck.id, engaged: true }),
      );

      // Change the API response to trigger another event
      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: true },
      });

      mockDuoProjectCacheUpdateListener([], new AbortController().signal);

      jest.advanceTimersByTime(500);
      await jest.runAllTimersAsync();

      // Both listeners should be called again
      expect(mockListener1.mock.calls[1][0]).toEqual(
        expect.objectContaining({ checkId: agenticChatSupportCheck.id, engaged: false }),
      );
      expect(mockListener2.mock.calls[1][0]).toEqual(
        expect.objectContaining({ checkId: agenticChatSupportCheck.id, engaged: false }),
      );
    });
  });

  describe('project cache change handling', () => {
    it('should recalculate when project cache changes', async () => {
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([initialProject]);

      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: true },
      });

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expect(mockApiService.fetchOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: { projectPath: 'initial/project' },
        }),
      );

      // Change to new project
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([newProject]);

      mockDuoProjectCacheUpdateListener([], new AbortController().signal);

      jest.advanceTimersByTime(500);
      await jest.runAllTimersAsync();

      expect(mockApiService.fetchOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: { projectPath: 'new/project' },
        }),
      );
    });

    it('should handle multiple projects by checking all of them', async () => {
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject1, mockProject2]);

      jest
        .mocked(fetchOperation)
        .mockResolvedValueOnce({ project: { duoAgenticChatAvailable: false } })
        .mockResolvedValueOnce({ project: { duoAgenticChatAvailable: true } });

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expect(mockApiService.fetchOperation).toHaveBeenCalledTimes(2);
      expect(mockApiService.fetchOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: { projectPath: 'test/project1' },
        }),
      );
      expect(mockApiService.fetchOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: { projectPath: 'test/project2' },
        }),
      );

      expectDebugLogToBeCalledWith('Agentic Chat is NOT supported for project test/project1');
      expectDebugLogToBeCalledWith('Agentic Chat is supported for project test/project2');

      // Should be available because at least one project supports it
      expect(agenticChatSupportCheck.engaged).toBe(false);
    });

    it('should handle all projects not supporting chat', async () => {
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject1, mockProject2]);

      // Both projects don't support chat
      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: false },
      });

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expect(mockApiService.fetchOperation).toHaveBeenCalledTimes(2);
      expect(agenticChatSupportCheck.engaged).toBe(true);
    });

    it('should emit change events when recalculation changes availability', async () => {
      const mockListener = jest.fn();

      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: false },
      });

      agenticChatSupportCheck = createAgenticChatSupportCheck();
      agenticChatSupportCheck.onChanged(mockListener);

      await jest.runAllTimersAsync();

      const initialCallCount = mockListener.mock.calls.length;

      // Change API response and trigger recalculation
      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: true },
      });

      mockDuoProjectCacheUpdateListener([], new AbortController().signal);

      jest.advanceTimersByTime(500);
      await jest.runAllTimersAsync();

      expect(mockListener.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  describe('workspace folder handling', () => {
    it('should handle errors during project recalculation', async () => {
      jest.mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder).mockImplementation(() => {
        throw new Error('Test error');
      });

      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expectDebugLogToBeCalledWith('Recalculating Agentic Chat availability...');
      expectErrorLogToBeCalledWith('Failed to calculate Agentic Chat availability');

      expect(agenticChatSupportCheck.engaged).toBe(true);
    });

    it('should handle multiple workspace folders', async () => {
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder1, mockWorkspaceFolder2]);

      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValueOnce([mockProject1])
        .mockReturnValueOnce([mockProject2]);

      jest
        .mocked(fetchOperation)
        .mockResolvedValueOnce({ project: { duoAgenticChatAvailable: false } })
        .mockResolvedValueOnce({ project: { duoAgenticChatAvailable: true } });

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expectDebugLogToBeCalledWith('Detected 2 workspace folder(s)');
      expectDebugLogToBeCalledWith('Checking 2 project(s) for Agentic Chat support');

      // Should be available because at least one project supports it
      expect(agenticChatSupportCheck.engaged).toBe(false);
    });

    it('should handle workspace folders with multiple projects each', async () => {
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder1, mockWorkspaceFolder2]);

      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValueOnce([mockProject1, mockProject2])
        .mockReturnValueOnce([initialProject, newProject]);

      jest
        .mocked(fetchOperation)
        .mockResolvedValueOnce({ project: { duoAgenticChatAvailable: false } })
        .mockResolvedValueOnce({ project: { duoAgenticChatAvailable: false } })
        .mockResolvedValueOnce({ project: { duoAgenticChatAvailable: true } })
        .mockResolvedValueOnce({ project: { duoAgenticChatAvailable: false } });

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expectDebugLogToBeCalledWith('Detected 2 workspace folder(s)');
      expectDebugLogToBeCalledWith('Checking 4 project(s) for Agentic Chat support');

      // Should be available because at least one project supports it
      expect(agenticChatSupportCheck.engaged).toBe(false);
    });

    it('should handle single workspace folder with one project', async () => {
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: true },
      });

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expectDebugLogToBeCalledWith('Recalculating Agentic Chat availability...');
      expectDebugLogToBeCalledWith('Detected 1 workspace folder(s)');
      expectDebugLogToBeCalledWith('Checking 1 project(s) for Agentic Chat support');

      expect(mockApiService.fetchOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: { projectPath: 'test/project' },
        }),
      );
    });

    it('should handle no workspace folders', async () => {
      mockConfigService.set('workspaceFolders', []);

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expectDebugLogToBeCalledWith('No workspace folders found.');
      expect(agenticChatSupportCheck.engaged).toBe(true);
    });

    it('should handle undefined workspace folders', async () => {
      mockConfigService.set('workspaceFolders', undefined);

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expectDebugLogToBeCalledWith('No workspace folders found.');
      expect(agenticChatSupportCheck.engaged).toBe(true);
    });

    it('should handle workspace folder with no projects', async () => {
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest.mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder).mockReturnValue([]);

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expectDebugLogToBeCalledWith('No Duo projects found in workspace folders.');
      expect(agenticChatSupportCheck.engaged).toBe(true);
    });
  });

  describe('when agent platform is disabled', () => {
    it('should skip API requests and set chat unavailable', async () => {
      mockConfigService.set('duo.agentPlatform.enabled', false);
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expect(mockApiService.fetchOperation).not.toHaveBeenCalled();
      expect(agenticChatSupportCheck.engaged).toBe(true);
      expectDebugLogToBeCalledWith(
        'Agent platform is disabled, skipping Agentic Chat availability check',
      );
    });

    it('should skip API requests on cache update when agent platform is disabled', async () => {
      mockConfigService.set('duo.agentPlatform.enabled', false);
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      jest.mocked(fetchOperation).mockClear();

      mockDuoProjectCacheUpdateListener([], new AbortController().signal);

      jest.advanceTimersByTime(500);
      await jest.runAllTimersAsync();

      expect(fetchOperation).not.toHaveBeenCalled();
      expect(agenticChatSupportCheck.engaged).toBe(true);
    });

    it('should resume API requests when agent platform is re-enabled', async () => {
      mockConfigService.set('duo.agentPlatform.enabled', false);
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: true },
      });

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expect(fetchOperation).not.toHaveBeenCalled();
      expect(agenticChatSupportCheck.engaged).toBe(true);

      // Re-enable agent platform
      mockConfigService.set('duo.agentPlatform.enabled', true);

      const { signal } = new AbortController();
      mockDuoProjectCacheUpdateListener([], signal);

      jest.advanceTimersByTime(500);
      await jest.runAllTimersAsync();

      expect(fetchOperation).toHaveBeenCalled();
      expect(agenticChatSupportCheck.engaged).toBe(false);
    });
  });

  describe('when agent platform config changes', () => {
    it('should recalculate when agent platform is enabled via config change', async () => {
      mockConfigService.set('duo.agentPlatform.enabled', false);
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: true },
      });

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expect(fetchOperation).not.toHaveBeenCalled();
      expect(agenticChatSupportCheck.engaged).toBe(true);

      // Enable agent platform via config change
      mockConfigService.set('duo.agentPlatform.enabled', true);

      jest.advanceTimersByTime(500);
      await jest.runAllTimersAsync();

      expect(fetchOperation).toHaveBeenCalled();
      expect(agenticChatSupportCheck.engaged).toBe(false);
    });

    it('should set chat unavailable when agent platform is disabled via config change', async () => {
      mockConfigService.set('duo.agentPlatform.enabled', true);
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: true },
      });

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      expect(agenticChatSupportCheck.engaged).toBe(false);

      // Disable agent platform via config change
      mockConfigService.set('duo.agentPlatform.enabled', false);

      jest.advanceTimersByTime(500);
      await jest.runAllTimersAsync();

      expect(agenticChatSupportCheck.engaged).toBe(true);
      expectDebugLogToBeCalledWith('Agent platform config changed, recalculating availability');
    });

    it('should not recalculate when agent platform config does not change', async () => {
      mockConfigService.set('duo.agentPlatform.enabled', true);
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: true },
      });

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      const callCount = jest.mocked(fetchOperation).mock.calls.length;

      // Set same value — should not trigger recalculation
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder, mockWorkspaceFolder1]);

      jest.advanceTimersByTime(500);
      await jest.runAllTimersAsync();

      expect(jest.mocked(fetchOperation).mock.calls.length).toBe(callCount);
    });
  });

  describe('dispose', () => {
    it('should dispose subscriptions', () => {
      const mockSubscriptionDispose = jest.fn();

      jest.mocked(mockProjectAccessCache.onDuoProjectCacheUpdate).mockReturnValue(
        createFakePartial<Disposable>({
          dispose: mockSubscriptionDispose,
        }),
      );

      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      const testCheck = createAgenticChatSupportCheck();

      testCheck.dispose();

      expect(mockSubscriptionDispose).toHaveBeenCalledTimes(1);
    });

    it('should abort ongoing initial request when disposed', async () => {
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      let resolvePromise: (value: GqlAgenticChatAvailable) => void;
      const fetchPromise = new Promise<GqlAgenticChatAvailable>((resolve) => {
        resolvePromise = resolve;
      });

      jest.mocked(fetchOperation).mockReturnValue(fetchPromise);

      const testCheck = createAgenticChatSupportCheck();

      await jest.advanceTimersToNextTimerAsync();

      testCheck.dispose();

      resolvePromise!({ project: { duoAgenticChatAvailable: true } });

      await jest.runAllTimersAsync();
    });
  });

  describe('debounced recalculation', () => {
    it('should debounce multiple rapid cache updates', async () => {
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: true },
      });

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      const initialCallCount = jest.mocked(fetchOperation).mock.calls.length;

      // Create abort controllers for each update
      const abortController1 = new AbortController();
      const abortController2 = new AbortController();
      const abortController3 = new AbortController();

      // Trigger multiple rapid updates
      mockDuoProjectCacheUpdateListener([], abortController1.signal);
      mockDuoProjectCacheUpdateListener([], abortController2.signal);
      mockDuoProjectCacheUpdateListener([], abortController3.signal);

      // Abort the first two signals
      abortController1.abort();
      abortController2.abort();

      jest.advanceTimersByTime(500);
      await jest.runAllTimersAsync();

      // Should only have made one additional call due to debouncing
      expect(jest.mocked(fetchOperation).mock.calls.length).toBe(initialCallCount + 1);
    });

    it('should handle sequential debounced updates', async () => {
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: true },
      });

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      const initialCallCount = jest.mocked(fetchOperation).mock.calls.length;

      // First batch of updates
      const abortController1 = new AbortController();
      const abortController2 = new AbortController();
      mockDuoProjectCacheUpdateListener([], abortController1.signal);
      mockDuoProjectCacheUpdateListener([], abortController2.signal);
      abortController1.abort();

      // Wait for first debounced recalculation
      jest.advanceTimersByTime(500);
      await jest.runAllTimersAsync();

      // Second batch of updates
      const abortController3 = new AbortController();
      const abortController4 = new AbortController();
      mockDuoProjectCacheUpdateListener([], abortController3.signal);
      mockDuoProjectCacheUpdateListener([], abortController4.signal);
      abortController3.abort();

      // Wait for second debounced recalculation
      jest.advanceTimersByTime(500);
      await jest.runAllTimersAsync();

      // Should have made two additional calls (one per batch, for the non-aborted signals)
      expect(jest.mocked(fetchOperation).mock.calls.length).toBe(initialCallCount + 2);
    });

    it('should handle aborted signals during recalculation', async () => {
      mockConfigService.set('workspaceFolders', [mockWorkspaceFolder]);
      jest
        .mocked(mockProjectAccessCache.getProjectsForWorkspaceFolder)
        .mockReturnValue([mockProject]);

      jest.mocked(fetchOperation).mockResolvedValue({
        project: { duoAgenticChatAvailable: true },
      });

      agenticChatSupportCheck = createAgenticChatSupportCheck();

      await jest.runAllTimersAsync();

      const initialCallCount = jest.mocked(fetchOperation).mock.calls.length;

      const abortController = new AbortController();
      mockDuoProjectCacheUpdateListener([], abortController.signal);

      // Abort the signal immediately
      abortController.abort();

      jest.advanceTimersByTime(500);
      await jest.runAllTimersAsync();

      // The recalculation should not make any API calls because the signal was aborted
      expect(jest.mocked(fetchOperation).mock.calls.length).toBe(initialCallCount);
    });
  });
});
