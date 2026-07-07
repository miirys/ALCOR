import { WorkspaceFolder } from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { createFakePartial } from '@gitlab-org/test-utils';
import { RepositoryFile, RepositoryService, Repository } from '@gitlab-org/repositories';
import { FsClient } from '../../../services/fs/fs';
import { createMockFsClient } from '../../../services/fs/fs.test_utils';
import { DuoProjectAccessChecker } from '../../../services/duo_access';
import { DuoProjectStatus } from '../../../services/duo_access/project_access_checker';
import { DefaultDependencyScanner } from './scanner';

// Mock dependencies
jest.mock('../../../services/git/repository_service');
jest.mock('../../../services/duo_access');
jest.mock('../../../services/fs');
jest.mock('./parser');

describe('DefaultDependencyScanner', () => {
  let scanner: DefaultDependencyScanner;
  let mockRepositoryService: RepositoryService;
  let mockProjectAccessChecker: DuoProjectAccessChecker;
  let mockFsClient: FsClient;

  beforeEach(() => {
    mockRepositoryService = createFakePartial<RepositoryService>({
      getCurrentFilesForRepository: jest.fn(),
    });
    mockProjectAccessChecker = createFakePartial<DuoProjectAccessChecker>({
      checkProjectStatus: jest.fn(),
    });
    mockFsClient = createMockFsClient();

    scanner = new DefaultDependencyScanner(
      mockRepositoryService,
      mockProjectAccessChecker,
      mockFsClient,
    );
  });

  describe('dependencyFileType', () => {
    it('should return the correct dependency type for a known file', () => {
      const file = { uri: URI.parse('package.json') } as RepositoryFile;
      const result = scanner.dependencyFileType(file);
      expect(result).toBeDefined();
      expect(result?.fileName).toMatch(/package\.json/);
    });

    it('should return undefined for an unknown file', () => {
      const file = { uri: URI.parse('unknown.txt') } as RepositoryFile;
      const result = scanner.dependencyFileType(file);
      expect(result).toBeUndefined();
    });
  });

  describe('findDependencies', () => {
    const mockRepo: Repository = createFakePartial<Repository>({
      uri: URI.parse('file:///mock/repo'),
    });
    const mockFolder: WorkspaceFolder = createFakePartial<WorkspaceFolder>({
      uri: 'file:///mock/workspace',
      name: 'mock',
    });

    beforeEach(() => {
      jest.mocked(mockRepositoryService).getCurrentFilesForRepository.mockReturnValue([
        {
          uri: URI.parse('file:///mock/repo/package.json'),
          workspaceFolder: mockFolder,
        } as RepositoryFile,
        {
          uri: URI.parse('file:///mock/repo/requirements.txt'),
          workspaceFolder: mockFolder,
        } as RepositoryFile,
      ]);

      jest
        .mocked(mockProjectAccessChecker)
        .checkProjectStatus.mockReturnValue({ status: DuoProjectStatus.DuoEnabled });

      jest.mocked(mockFsClient.promises.readFile).mockImplementation((filePath) => {
        if (filePath.toString().includes('package.json')) {
          return Promise.resolve('{"dependencies": {"test": "1.0.0"}}');
        }
        if (filePath.toString().includes('requirements.txt')) {
          return Promise.resolve('test==1.0.0');
        }
        return Promise.resolve('');
      });
    });

    it('should find dependencies for all supported file types', async () => {
      const dependencies = await scanner.findDependencies(mockRepo, mockFolder);

      expect(dependencies).toHaveLength(2); // One for package.json, one for requirements.txt
      expect(mockRepositoryService.getCurrentFilesForRepository).toHaveBeenCalledWith(
        mockRepo.uri,
        mockFolder.uri,
        { excludeGitFolder: true, excludeIgnored: true },
      );
      expect(mockProjectAccessChecker.checkProjectStatus).toHaveBeenCalledTimes(2);
      expect(mockFsClient.promises.readFile).toHaveBeenCalledTimes(2);
    });

    it('should skip files in projects where Duo is disabled', async () => {
      jest
        .mocked(mockProjectAccessChecker)
        .checkProjectStatus.mockReturnValueOnce({ status: DuoProjectStatus.DuoDisabled });

      const dependencies = await scanner.findDependencies(mockRepo, mockFolder);

      expect(dependencies).toHaveLength(1); // Only one file should be processed
      expect(mockFsClient.promises.readFile).toHaveBeenCalledTimes(1);
    });

    it('should handle errors gracefully', async () => {
      jest.mocked(mockFsClient.promises.readFile).mockImplementationOnce(() => {
        throw new Error('File read error');
      });

      await expect(scanner.findDependencies(mockRepo, mockFolder)).resolves.toHaveLength(1);
    });
  });
});
