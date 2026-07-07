import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { FileAccessService, FsClient } from '@gitlab-org/fs';
import { ConfigService, ClientConfig } from '@gitlab-org/config';
import { getTrustedReadableDirectories } from '@gitlab-org/ai-configuration';
import { WorkflowAction } from '../clients/types';
import { assertAccessibleFile } from './assert_accessible_file';
import { FileStateTracker } from './file_state_tracker';
import { ReadFilesActionHandler, ReadFilesAction, ReadFilesFormatter } from './read_files';
import { WorkflowActionContext } from './index';

jest.mock('./assert_accessible_file', () => ({
  assertAccessibleFile: jest.fn(),
}));

jest.mock('@gitlab-org/ai-configuration', () => ({
  getTrustedReadableDirectories: jest.fn().mockReturnValue([]),
}));

describe('ReadFilesActionHandler', () => {
  let readFilesHandler: ReadFilesActionHandler;
  let mockLogger: TestLogger;
  let mockFileAccessService: FileAccessService;
  let mockFileStateTracker: FileStateTracker;
  let mockFsClient: FsClient;
  let mockConfigService: ConfigService;

  const workspaceFolderPath = '/path/to/folder';
  const filePaths = ['file1.ts', 'file2.ts', 'file3.ts'];
  const fileContents = ['content1', 'content2', 'content3'];
  let workflowActionContext: WorkflowActionContext;

  beforeEach(() => {
    mockLogger = new TestLogger();
    mockFileAccessService = createFakePartial<FileAccessService>({
      getText: jest.fn(),
      writeFile: jest.fn().mockResolvedValue(undefined),
      realPath: jest.fn().mockImplementation((p: string) => Promise.resolve(p)),
    });
    mockFileStateTracker = createFakePartial<FileStateTracker>({
      recordFileRead: jest.fn().mockReturnValue(undefined),
      assertFileNotModifiedSinceLastRead: jest.fn(),
    });
    mockFsClient = createFakePartial<FsClient>({
      promises: createFakePartial<FsClient['promises']>({
        stat: jest.fn().mockResolvedValue({}),
        readFileFirstBytes: jest.fn().mockResolvedValue('text content'),
      }),
    });

    mockConfigService = createFakePartial<ConfigService>({
      get: jest.fn(() =>
        createFakePartial<ClientConfig>({ workspaceFolders: [] }),
      ) as unknown as ConfigService['get'],
    });

    readFilesHandler = new ReadFilesActionHandler(
      mockLogger,
      [mockFileAccessService],
      mockFsClient,
      mockConfigService,
    );

    workflowActionContext = createFakePartial<WorkflowActionContext>({
      workspaceFolderPath,
      fileStateTracker: mockFileStateTracker,
    });
  });

  describe('canHandle', () => {
    it('returns true for runReadFiles actions', () => {
      const action = createFakePartial<WorkflowAction>({
        runReadFiles: { filepaths: filePaths },
      });

      expect(readFilesHandler.canHandle(action)).toBe(true);
    });

    it('returns false for other actions', () => {
      const action: WorkflowAction = {
        someOtherAction: {},
      } as unknown as WorkflowAction;

      expect(readFilesHandler.canHandle(action)).toBe(false);
    });
  });

  describe('execute', () => {
    let action: ReadFilesAction;

    beforeEach(() => {
      action = createFakePartial<ReadFilesAction>({
        runReadFiles: { filepaths: filePaths },
      });
    });

    it('returns user-friendly message for file not found', async () => {
      const enoentError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      jest.mocked(mockFsClient.promises.stat).mockImplementation(async (path) => {
        if (String(path).includes('file2.ts')) {
          throw enoentError;
        }
        return {} as ReturnType<typeof mockFsClient.promises.stat>;
      });
      jest.mocked(mockFileAccessService.getText).mockResolvedValue('content');

      const result = await readFilesHandler.execute(action, workflowActionContext);

      const parsedResponse = JSON.parse(result.response);
      expect(parsedResponse['file1.ts']).toEqual({ content: 'content' });
      expect(parsedResponse['file2.ts']).toEqual({ error: 'File not found: "file2.ts"' });
      expect(parsedResponse['file3.ts']).toEqual({ content: 'content' });
    });

    it('handles other file read errors', async () => {
      const error = new Error('Permission denied');
      jest
        .mocked(mockFileAccessService.getText)
        .mockResolvedValueOnce(fileContents[0])
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(fileContents[2]);

      const result = await readFilesHandler.execute(action, workflowActionContext);

      const expectedResponse = {
        'file1.ts': { content: 'content1' },
        'file2.ts': { error: `Error reading file: ${error.message}` },
        'file3.ts': { content: 'content3' },
      };

      expect(JSON.parse(result.response)).toEqual(expectedResponse);
    });

    it('handles empty file list', async () => {
      const emptyAction = createFakePartial<ReadFilesAction>({
        runReadFiles: { filepaths: [] },
      });

      const result = await readFilesHandler.execute(emptyAction, workflowActionContext);

      expect(mockFileAccessService.getText).not.toHaveBeenCalled();
      expect(result).toEqual({ response: '{}', error: '' });
    });

    it('handles validation errors for individual files', async () => {
      const validationError = new Error('Path is outside the workspace folder');
      jest.mocked(assertAccessibleFile).mockImplementation(async (filePath) => {
        if (filePath === 'file2.ts') {
          throw validationError;
        }
      });

      jest.mocked(mockFileAccessService.getText).mockResolvedValue('content');

      const result = await readFilesHandler.execute(action, workflowActionContext);

      const expectedResponse = {
        'file1.ts': { content: 'content' },
        'file2.ts': { error: `Error reading file: ${validationError.message}` },
        'file3.ts': { content: 'content' },
      };

      expect(JSON.parse(result.response)).toEqual(expectedResponse);
      expect(result.error).toBe('');

      // Restore default behaviour: clearMocks resets calls but not the
      // throwing implementation set above.
      jest.mocked(assertAccessibleFile).mockResolvedValue(undefined);
    });

    it('rejects binary files with an error', async () => {
      jest.mocked(mockFsClient.promises.readFileFirstBytes).mockImplementation(async (path) => {
        if (String(path).includes('file2.ts')) {
          return 'binary\0content';
        }
        return 'text content';
      });
      jest.mocked(mockFileAccessService.getText).mockResolvedValue('content');

      const result = await readFilesHandler.execute(action, workflowActionContext);

      const parsedResponse = JSON.parse(result.response);
      expect(parsedResponse['file1.ts']).toEqual({ content: 'content' });
      expect(parsedResponse['file2.ts']).toEqual({
        error: 'Cannot read file: "file2.ts" is a binary file',
      });
      expect(parsedResponse['file3.ts']).toEqual({ content: 'content' });
      expect(mockFileAccessService.getText).toHaveBeenCalledTimes(2);
    });

    describe('when filepaths include absolute paths in trusted directories', () => {
      const trustedDir = '/home/testuser/.agents';
      const trustedPath = '/home/testuser/.agents/skills/my-skill/SKILL.md';
      const skillContent = '# My Skill';

      beforeEach(() => {
        jest.mocked(getTrustedReadableDirectories).mockReturnValue([trustedDir]);
      });

      it('reads a trusted absolute path alongside repo-relative paths', async () => {
        jest.mocked(mockFileAccessService.getText).mockImplementation(async (p: string) => {
          if (p === trustedPath) return skillContent;
          return 'repo content';
        });

        action = createFakePartial<ReadFilesAction>({
          runReadFiles: { filepaths: ['file1.ts', trustedPath] },
        });

        const result = await readFilesHandler.execute(action, workflowActionContext);

        const parsedResponse = JSON.parse(result.response);
        expect(parsedResponse['file1.ts']).toEqual({ content: 'repo content' });
        expect(parsedResponse[trustedPath]).toEqual({ content: skillContent });
      });

      it('rejects absolute paths outside trusted directories', async () => {
        action = createFakePartial<ReadFilesAction>({
          runReadFiles: { filepaths: ['/etc/passwd'] },
        });

        const result = await readFilesHandler.execute(action, workflowActionContext);

        const parsedResponse = JSON.parse(result.response);
        expect(parsedResponse['/etc/passwd'].error).toContain('Access denied');
        expect(parsedResponse['/etc/passwd'].error).toContain('not in a trusted directory');
        expect(mockFileAccessService.getText).not.toHaveBeenCalled();
      });

      it('rejects path traversal that escapes a trusted directory', async () => {
        const traversal = '/home/testuser/.agents/../../etc/passwd';
        action = createFakePartial<ReadFilesAction>({
          runReadFiles: { filepaths: [traversal] },
        });

        const result = await readFilesHandler.execute(action, workflowActionContext);

        const parsedResponse = JSON.parse(result.response);
        expect(parsedResponse[traversal].error).toContain('Access denied');
        expect(mockFileAccessService.getText).not.toHaveBeenCalled();
      });

      it('rejects symlinks that resolve outside trusted directories', async () => {
        const symlinkPath = '/home/testuser/.agents/skills/evil-link';
        jest.mocked(mockFileAccessService.realPath).mockImplementation(async (p: string) => {
          if (p === symlinkPath) return '/etc/shadow';
          return p;
        });

        action = createFakePartial<ReadFilesAction>({
          runReadFiles: { filepaths: [symlinkPath] },
        });

        const result = await readFilesHandler.execute(action, workflowActionContext);

        const parsedResponse = JSON.parse(result.response);
        expect(parsedResponse[symlinkPath].error).toContain('Access denied');
        expect(parsedResponse[symlinkPath].error).toContain(
          'resolves to a path outside trusted directories',
        );
        expect(mockFileAccessService.getText).not.toHaveBeenCalled();
      });

      it('does not record trusted reads in the file state tracker', async () => {
        jest.mocked(mockFileAccessService.getText).mockResolvedValue(skillContent);

        action = createFakePartial<ReadFilesAction>({
          runReadFiles: { filepaths: [trustedPath] },
        });

        await readFilesHandler.execute(action, workflowActionContext);

        expect(mockFileStateTracker.recordFileRead).not.toHaveBeenCalled();
      });
    });

    describe('file read state tracking', () => {
      beforeEach(() => {
        jest
          .mocked(mockFileAccessService.getText)
          .mockResolvedValueOnce(fileContents[0])
          .mockResolvedValueOnce(fileContents[1])
          .mockResolvedValueOnce(fileContents[2]);
      });

      it('should record file read for each successfully read file', async () => {
        await readFilesHandler.execute(action, workflowActionContext);

        expect(mockFileStateTracker.recordFileRead).toHaveBeenCalledTimes(3);
        expect(mockFileStateTracker.recordFileRead).toHaveBeenCalledWith(
          `${workspaceFolderPath}/file1.ts`,
          fileContents[0],
        );
        expect(mockFileStateTracker.recordFileRead).toHaveBeenCalledWith(
          `${workspaceFolderPath}/file2.ts`,
          fileContents[1],
        );
        expect(mockFileStateTracker.recordFileRead).toHaveBeenCalledWith(
          `${workspaceFolderPath}/file3.ts`,
          fileContents[2],
        );
      });

      it('should not record file read for failed files', async () => {
        const error = new Error('File not found');
        jest
          .mocked(mockFileAccessService.getText)
          .mockReset()
          .mockResolvedValueOnce(fileContents[0])
          .mockRejectedValueOnce(error)
          .mockResolvedValueOnce(fileContents[2]);

        await readFilesHandler.execute(action, workflowActionContext);

        expect(mockFileStateTracker.recordFileRead).toHaveBeenCalledTimes(2);
        expect(mockFileStateTracker.recordFileRead).toHaveBeenCalledWith(
          `${workspaceFolderPath}/file1.ts`,
          fileContents[0],
        );
        expect(mockFileStateTracker.recordFileRead).toHaveBeenCalledWith(
          `${workspaceFolderPath}/file3.ts`,
          fileContents[2],
        );
        expect(mockFileStateTracker.recordFileRead).not.toHaveBeenCalledWith(
          `${workspaceFolderPath}/file2.ts`,
          expect.anything(),
        );
      });
    });
  });
});

describe('ReadFilesFormatter', () => {
  let formatter: ReadFilesFormatter;

  beforeEach(() => {
    formatter = new ReadFilesFormatter();
  });

  it('maps valid file_paths to the read_files display', () => {
    expect(formatter.format({ file_paths: ['a.ts', 'b.ts'] })).toEqual({
      tool: 'read_files',
      filepaths: ['a.ts', 'b.ts'],
    });
  });

  it('accepts an empty array', () => {
    expect(formatter.format({ file_paths: [] })).toEqual({
      tool: 'read_files',
      filepaths: [],
    });
  });

  it.each([
    ['file_paths missing', {}],
    ['file_paths undefined', { file_paths: undefined }],
    ['file_paths null', { file_paths: null }],
    ['file_paths a string', { file_paths: 'a.ts' }],
    ['file_paths a number', { file_paths: 42 }],
    ['a mixed array', { file_paths: ['a.ts', 42, 'b.ts'] }],
  ])('throws on %s', (_label, args) => {
    expect(() => formatter.format(args)).toThrow();
  });
});
