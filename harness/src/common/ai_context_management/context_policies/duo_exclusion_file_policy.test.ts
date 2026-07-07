import { WorkspaceFolder } from 'vscode-languageserver-types';
import { createFakePartial } from '@gitlab-org/test-utils';
import { RepositoryService } from '@gitlab-org/repositories';
import {
  DuoExclusionChecker,
  DuoProjectAccessChecker,
  DuoProjectStatus,
  DuoProject,
  ExclusionCheckResult,
} from '../../services/duo_access';
import { log } from '../../log';
import { DISABLED_REASONS } from '../context_providers/constants';
import { DefaultDuoExclusionFilePolicyProvider } from './duo_exclusion_file_policy';

jest.mock('../../log');

describe('DefaultDuoExclusionFilePolicyProvider', () => {
  let policyProvider: DefaultDuoExclusionFilePolicyProvider;
  let mockRepositoryService: RepositoryService;
  let mockDuoProjectAccessChecker: DuoProjectAccessChecker;
  let mockDuoExclusionChecker: DuoExclusionChecker;

  const workspaceFolder: WorkspaceFolder = {
    name: 'workspace1',
    uri: 'file:///path/to/workspace1',
  };

  const mockProject = createFakePartial<DuoProject>({
    projectPath: 'namespace/project',
    uri: 'file:///path/to/workspace1/.git/config',
    enabled: true,
    exclusionRules: ['*.log', 'tmp/**/*'],
    host: 'gitlab.com',
    namespace: 'namespace',
    namespaceWithPath: 'namespace/project',
    remoteName: 'origin',
  });

  const createProvider = () => {
    mockRepositoryService = createFakePartial<RepositoryService>({
      onWorkspaceRepositoriesFinished: jest.fn(),
    });

    mockDuoProjectAccessChecker = createFakePartial<DuoProjectAccessChecker>({
      checkProjectStatus: jest.fn(),
    });

    mockDuoExclusionChecker = createFakePartial<DuoExclusionChecker>({
      checkFileExclusion: jest.fn(),
    });

    policyProvider = new DefaultDuoExclusionFilePolicyProvider(
      mockRepositoryService,
      mockDuoProjectAccessChecker,
      mockDuoExclusionChecker,
    );
    return policyProvider;
  };

  beforeEach(() => {
    createProvider();
  });

  describe('constructor', () => {
    it('registers workspace folder callback', () => {
      expect(mockRepositoryService.onWorkspaceRepositoriesFinished).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

    it('sets workspace folder when callback is triggered', () => {
      const callback = jest.mocked(mockRepositoryService.onWorkspaceRepositoriesFinished).mock
        .calls[0][0];
      callback(workspaceFolder);
      expect(log.info).toHaveBeenCalledWith(
        '[Duo Exclusion Policy] Workspace folder initialized: file:///path/to/workspace1',
      );
    });
  });

  describe('isContextItemAllowed', () => {
    it('returns enabled when no workspace folder is available', async () => {
      const result = await policyProvider.isContextItemAllowed('src/file.js');
      expect(result).toEqual({
        enabled: true,
      });
      expect(log.debug).toHaveBeenCalledWith(
        '[Duo Exclusion Policy] No workspace folder available, allowing context item',
      );
    });

    describe('with workspace folder', () => {
      beforeEach(() => {
        const callback = jest.mocked(mockRepositoryService.onWorkspaceRepositoriesFinished).mock
          .calls[0][0];
        callback(workspaceFolder);
      });

      it('returns enabled for non-GitLab projects', async () => {
        jest.mocked(mockDuoProjectAccessChecker.checkProjectStatus).mockReturnValue({
          status: DuoProjectStatus.NonGitlabProject,
        });

        const result = await policyProvider.isContextItemAllowed('src/file.js');

        expect(result).toEqual({
          enabled: true,
        });
        expect(log.debug).toHaveBeenCalledWith(
          '[Duo Exclusion Policy] No project found, allowing context item',
        );
      });

      it('returns enabled when no project found', async () => {
        jest.mocked(mockDuoProjectAccessChecker.checkProjectStatus).mockReturnValue({
          status: DuoProjectStatus.DuoEnabled,
          project: undefined,
        });

        const result = await policyProvider.isContextItemAllowed('src/file.js');

        expect(result).toEqual({
          enabled: true,
        });
        expect(log.debug).toHaveBeenCalledWith(
          '[Duo Exclusion Policy] No project found, allowing context item',
        );
      });

      it('returns enabled when file is not excluded', async () => {
        jest.mocked(mockDuoProjectAccessChecker.checkProjectStatus).mockReturnValue({
          status: DuoProjectStatus.DuoEnabled,
          project: mockProject,
        });

        const exclusionResult: ExclusionCheckResult = {
          isExcluded: false,
          project: mockProject,
        };
        jest.mocked(mockDuoExclusionChecker.checkFileExclusion).mockReturnValue(exclusionResult);

        const result = await policyProvider.isContextItemAllowed('src/file.js');

        expect(result).toEqual({
          enabled: true,
        });
        expect(log.debug).toHaveBeenCalledWith(
          '[Duo Exclusion Policy] File src/file.js is allowed',
        );
      });

      it('returns disabled when file is excluded', async () => {
        jest.mocked(mockDuoProjectAccessChecker.checkProjectStatus).mockReturnValue({
          status: DuoProjectStatus.DuoEnabled,
          project: mockProject,
        });

        const exclusionResult: ExclusionCheckResult = {
          isExcluded: true,
          project: mockProject,
        };
        jest.mocked(mockDuoExclusionChecker.checkFileExclusion).mockReturnValue(exclusionResult);

        const result = await policyProvider.isContextItemAllowed('app.log');

        expect(result).toEqual({
          enabled: false,
          disabledReasons: [DISABLED_REASONS.DUO_CONTEXT_EXCLUDED],
        });
        expect(log.debug).toHaveBeenCalledWith(
          '[Duo Exclusion Policy] File app.log is excluded by project exclusion rules',
        );
      });

      it('calls checkProjectStatus with correct parameters', async () => {
        jest.mocked(mockDuoProjectAccessChecker.checkProjectStatus).mockReturnValue({
          status: DuoProjectStatus.NonGitlabProject,
        });

        await policyProvider.isContextItemAllowed('src/file.js');

        expect(mockDuoProjectAccessChecker.checkProjectStatus).toHaveBeenCalledWith(
          'file:///path/to/workspace1/src/file.js',
          workspaceFolder,
        );
      });

      it('calls checkFileExclusion with correct parameters', async () => {
        jest.mocked(mockDuoProjectAccessChecker.checkProjectStatus).mockReturnValue({
          status: DuoProjectStatus.DuoEnabled,
          project: mockProject,
        });

        const exclusionResult: ExclusionCheckResult = {
          isExcluded: false,
          project: mockProject,
        };
        jest.mocked(mockDuoExclusionChecker.checkFileExclusion).mockReturnValue(exclusionResult);

        await policyProvider.isContextItemAllowed('src/file.js');

        expect(mockDuoExclusionChecker.checkFileExclusion).toHaveBeenCalledWith(
          'src/file.js',
          mockProject,
        );
      });

      describe('with various file patterns', () => {
        beforeEach(() => {
          jest.mocked(mockDuoProjectAccessChecker.checkProjectStatus).mockReturnValue({
            status: DuoProjectStatus.DuoEnabled,
            project: mockProject,
          });
        });

        it.each([
          ['src/file.js', false, true],
          ['app.log', true, false],
          ['debug.log', true, false],
          ['tmp/cache.txt', true, false],
          ['tmp/nested/file.js', true, false],
          ['README.md', false, true],
          ['config.json', false, true],
        ])(
          'checks exclusion for %s (excluded: %s, enabled: %s)',
          async (filePath, isExcluded, expectedEnabled) => {
            const exclusionResult: ExclusionCheckResult = {
              isExcluded,
              project: mockProject,
            };
            jest
              .mocked(mockDuoExclusionChecker.checkFileExclusion)
              .mockReturnValue(exclusionResult);

            const result = await policyProvider.isContextItemAllowed(filePath);

            expect(result.enabled).toBe(expectedEnabled);
            if (!expectedEnabled) {
              expect(result.disabledReasons).toEqual([DISABLED_REASONS.DUO_CONTEXT_EXCLUDED]);
            }
          },
        );
      });
    });
  });
});
