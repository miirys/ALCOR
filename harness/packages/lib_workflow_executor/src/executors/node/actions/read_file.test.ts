import { join } from 'node:path';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { FileAccessService, FsClient } from '@gitlab-org/fs';
import { ConfigService, ClientConfig } from '@gitlab-org/config';
import { getTrustedReadableDirectories } from '@gitlab-org/ai-configuration';
import { WorkflowAction } from '../clients/types';
import { assertAccessibleFile } from './assert_accessible_file';
import { FileStateTracker } from './file_state_tracker';
import { ReadFileActionHandler, ReadFileAction, ReadFileFormatter } from './read_file';
import { WorkflowActionContext } from './index';

jest.mock('./assert_accessible_file', () => ({
  assertAccessibleFile: jest.fn(),
}));

jest.mock('@gitlab-org/ai-configuration', () => ({
  getTrustedReadableDirectories: jest.fn().mockReturnValue([]),
}));

describe('ReadFileActionHandler', () => {
  let readFileHandler: ReadFileActionHandler;
  let mockLogger: TestLogger;
  let mockFileAccessService: FileAccessService;
  let mockFileStateTracker: FileStateTracker;
  let mockFsClient: FsClient;
  let mockConfigService: ConfigService;

  const workspaceFolderPath = '/path/to/folder';
  const filepath = 'some/file.ts';
  const fullFilePath = join(workspaceFolderPath, filepath);
  const fileContent = 'file content';
  let workflowActionContext: WorkflowActionContext;

  beforeEach(() => {
    mockLogger = new TestLogger();
    mockFileAccessService = createFakePartial<FileAccessService>({
      getText: jest.fn().mockResolvedValue(fileContent),
      writeFile: jest.fn().mockResolvedValue(undefined),
      realPath: jest.fn().mockImplementation((p: string) => Promise.resolve(p)),
    });
    mockFileStateTracker = createFakePartial<FileStateTracker>({
      recordFileRead: jest.fn().mockReturnValue(undefined),
      assertFileNotModifiedSinceLastRead: jest.fn(),
    });
    mockFsClient = createFakePartial<FsClient>({
      promises: createFakePartial<FsClient['promises']>({
        stat: jest.fn().mockResolvedValue({ size: 100 }),
        readFileFirstBytes: jest.fn().mockResolvedValue(fileContent),
      }),
    });

    mockConfigService = createFakePartial<ConfigService>({
      get: jest.fn(() =>
        createFakePartial<ClientConfig>({ workspaceFolders: [] }),
      ) as unknown as ConfigService['get'],
    });

    readFileHandler = new ReadFileActionHandler(
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
    it('returns true for runReadFile actions', () => {
      const action = createFakePartial<WorkflowAction>({
        runReadFile: { filepath },
      });

      expect(readFileHandler.canHandle(action)).toBe(true);
    });

    it('returns false for other actions', () => {
      const action: WorkflowAction = {
        someOtherAction: {},
      } as unknown as WorkflowAction;

      expect(readFileHandler.canHandle(action)).toBe(false);
    });
  });

  describe('execute', () => {
    let action: ReadFileAction;

    beforeEach(() => {
      action = createFakePartial<ReadFileAction>({
        runReadFile: { filepath },
      });
    });

    it('reads the file at the specified path', async () => {
      const result = await readFileHandler.execute(action, workflowActionContext);

      expect(mockFileAccessService.getText).toHaveBeenCalledWith(fullFilePath);
      expect(result).toEqual({ response: fileContent, error: '' });
    });

    it('joins the folder name and file path correctly', async () => {
      await readFileHandler.execute(action, workflowActionContext);

      expect(mockFileAccessService.getText).toHaveBeenCalledWith(
        join(workspaceFolderPath, filepath),
      );
    });

    it('returns user-friendly message for file not found', async () => {
      const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      jest.mocked(mockFsClient.promises.stat).mockRejectedValue(error);

      await expect(readFileHandler.execute(action, workflowActionContext)).resolves.toEqual({
        error: `File not found: "${filepath}"`,
        response: '',
      });
    });

    it('handles other file read errors', async () => {
      const error = new Error('Permission denied');
      jest.mocked(mockFileAccessService.getText).mockRejectedValue(error);

      await expect(readFileHandler.execute(action, workflowActionContext)).resolves.toEqual({
        error: `Error reading file: ${error.message}`,
        response: '',
      });
    });

    it('rejects binary files with an error', async () => {
      jest.mocked(mockFsClient.promises.readFileFirstBytes).mockResolvedValue('binary\0content');

      const result = await readFileHandler.execute(action, workflowActionContext);

      expect(result).toEqual({
        response: '',
        error: `Cannot read file: "${filepath}" is a binary file`,
      });
      expect(mockFileAccessService.getText).not.toHaveBeenCalled();
    });

    it('validates file is accessible', async () => {
      await readFileHandler.execute(action, workflowActionContext);

      expect(assertAccessibleFile).toHaveBeenCalledWith(
        filepath,
        workspaceFolderPath,
        expect.any(Object),
        expect.any(Object),
        undefined,
      );
    });

    describe('when offset and limit are provided', () => {
      const multiLineContent = 'line0\nline1\nline2\nline3\nline4';

      beforeEach(() => {
        jest.mocked(mockFileAccessService.getText).mockResolvedValue(multiLineContent);
      });

      describe('when only offset is provided', () => {
        it('returns content from the offset to the end', async () => {
          action = createFakePartial<ReadFileAction>({
            runReadFile: { filepath, offset: 2 },
          });

          const result = await readFileHandler.execute(action, workflowActionContext);

          expect(result.response).toBe('line2\nline3\nline4');
        });
      });

      describe('when only limit is provided', () => {
        it('returns the first N lines with pagination message', async () => {
          action = createFakePartial<ReadFileAction>({
            runReadFile: { filepath, limit: 3 },
          });

          const result = await readFileHandler.execute(action, workflowActionContext);

          expect(result.response).toContain('line0\nline1\nline2');
          expect(result.response).toContain('Showing lines 1-3 of 5 total');
          expect(result.response).toContain('Use offset=3 to continue reading');
        });
      });

      describe('when both offset and limit are provided', () => {
        it('returns N lines starting from the offset with pagination message', async () => {
          action = createFakePartial<ReadFileAction>({
            runReadFile: { filepath, offset: 1, limit: 2 },
          });

          const result = await readFileHandler.execute(action, workflowActionContext);

          expect(result.response).toContain('line1\nline2');
          expect(result.response).toContain('Showing lines 2-3 of 5 total');
          expect(result.response).toContain('Use offset=3 to continue reading');
        });
      });

      describe('when neither offset nor limit is provided', () => {
        it('returns the full file content without pagination message', async () => {
          action = createFakePartial<ReadFileAction>({
            runReadFile: { filepath },
          });

          const result = await readFileHandler.execute(action, workflowActionContext);

          expect(result.response).toBe(multiLineContent);
        });
      });

      describe('when offset exceeds file length', () => {
        it('returns an empty string', async () => {
          action = createFakePartial<ReadFileAction>({
            runReadFile: { filepath, offset: 100 },
          });

          const result = await readFileHandler.execute(action, workflowActionContext);

          expect(result.response).toBe('');
        });
      });

      describe('when limit exceeds remaining lines', () => {
        it('returns all remaining lines from offset without pagination message', async () => {
          action = createFakePartial<ReadFileAction>({
            runReadFile: { filepath, offset: 3, limit: 100 },
          });

          const result = await readFileHandler.execute(action, workflowActionContext);

          expect(result.response).toBe('line3\nline4');
        });
      });

      it('records the full file content in file state tracker regardless of slicing', async () => {
        action = createFakePartial<ReadFileAction>({
          runReadFile: { filepath, offset: 1, limit: 2 },
        });

        await readFileHandler.execute(action, workflowActionContext);

        expect(mockFileStateTracker.recordFileRead).toHaveBeenCalledWith(
          fullFilePath,
          multiLineContent,
        );
      });
    });

    describe('when file exceeds size limit', () => {
      it('rejects files larger than 20 MB', async () => {
        const largeSizeBytes = 21 * 1024 * 1024;
        jest.mocked(mockFsClient.promises.stat).mockResolvedValue(
          createFakePartial<Awaited<ReturnType<FsClient['promises']['stat']>>>({
            size: largeSizeBytes,
          }),
        );

        const result = await readFileHandler.execute(action, workflowActionContext);

        expect(result.response).toBe('');
        expect(result.error).toContain('exceeds the 20 MB limit');
        expect(mockFileAccessService.getText).not.toHaveBeenCalled();
      });
    });

    describe('when filepath is an absolute path in a trusted directory', () => {
      const trustedDir = '/home/testuser/.agents';
      const absolutePath = '/home/testuser/.agents/skills/my-skill/SKILL.md';
      const skillContent = '# My Skill\nDo something useful';

      beforeEach(() => {
        jest.mocked(getTrustedReadableDirectories).mockReturnValue([trustedDir]);
        jest.mocked(mockFileAccessService.getText).mockResolvedValue(skillContent);

        action = createFakePartial<ReadFileAction>({
          runReadFile: { filepath: absolutePath },
        });
      });

      it('reads the file successfully', async () => {
        const result = await readFileHandler.execute(action, workflowActionContext);

        expect(result).toEqual({ response: skillContent, error: '' });
      });

      it('supports offset and limit', async () => {
        action = createFakePartial<ReadFileAction>({
          runReadFile: { filepath: absolutePath, offset: 1, limit: 1 },
        });

        const result = await readFileHandler.execute(action, workflowActionContext);

        expect(result.response).toContain('Do something useful');
      });

      it('rejects binary files', async () => {
        jest.mocked(mockFsClient.promises.readFileFirstBytes).mockResolvedValue('binary\0content');

        const result = await readFileHandler.execute(action, workflowActionContext);

        expect(result.error).toContain('is a binary file');
      });

      it('reports a resolution error when realPath resolves to empty string', async () => {
        jest.mocked(mockFileAccessService.realPath).mockResolvedValue('');

        const result = await readFileHandler.execute(action, workflowActionContext);

        expect(result.error).toContain('Cannot resolve path');
      });
    });

    describe('when no trusted directories are configured', () => {
      beforeEach(() => {
        jest.mocked(getTrustedReadableDirectories).mockReturnValue([]);

        action = createFakePartial<ReadFileAction>({
          runReadFile: { filepath: '/home/testuser/.agents/skills/x/SKILL.md' },
        });
      });

      it('rejects every absolute path', async () => {
        const result = await readFileHandler.execute(action, workflowActionContext);

        expect(result.error).toContain('Access denied');
        expect(mockFileAccessService.getText).not.toHaveBeenCalled();
      });
    });

    describe('when filepath is an absolute path outside trusted directories', () => {
      beforeEach(() => {
        jest.mocked(getTrustedReadableDirectories).mockReturnValue(['/home/testuser/.agents']);

        action = createFakePartial<ReadFileAction>({
          runReadFile: { filepath: '/etc/passwd' },
        });
      });

      it('rejects the read with access denied', async () => {
        const result = await readFileHandler.execute(action, workflowActionContext);

        expect(result.error).toContain('Access denied');
        expect(result.error).toContain('not in a trusted directory');
        expect(mockFileAccessService.getText).not.toHaveBeenCalled();
      });
    });

    describe('when filepath uses path traversal to escape trusted directory', () => {
      beforeEach(() => {
        jest.mocked(getTrustedReadableDirectories).mockReturnValue(['/home/testuser/.agents']);

        action = createFakePartial<ReadFileAction>({
          runReadFile: { filepath: '/home/testuser/.agents/../../etc/passwd' },
        });
      });

      it('rejects the read after path normalization', async () => {
        const result = await readFileHandler.execute(action, workflowActionContext);

        expect(result.error).toContain('Access denied');
        expect(mockFileAccessService.getText).not.toHaveBeenCalled();
      });
    });

    describe('when symlink resolves outside trusted directory', () => {
      const trustedDir = '/home/testuser/.agents';
      const symlinkPath = '/home/testuser/.agents/skills/evil-link';

      beforeEach(() => {
        jest.mocked(getTrustedReadableDirectories).mockReturnValue([trustedDir]);
        jest.mocked(mockFileAccessService.realPath).mockImplementation(async (p: string) => {
          if (p === symlinkPath) return '/etc/shadow';
          return p;
        });

        action = createFakePartial<ReadFileAction>({
          runReadFile: { filepath: symlinkPath },
        });
      });

      it('rejects the read after symlink resolution', async () => {
        const result = await readFileHandler.execute(action, workflowActionContext);

        expect(result.error).toContain('Access denied');
        expect(result.error).toContain('resolves to a path outside trusted directories');
        expect(mockFileAccessService.getText).not.toHaveBeenCalled();
      });
    });

    describe('when symlink resolves to another path inside a trusted directory', () => {
      const trustedDir = '/home/testuser/.agents';
      const symlinkPath = '/home/testuser/.agents/skills/link';
      const targetPath = '/home/testuser/.agents/skills/target.md';
      const targetContent = '# Target';

      beforeEach(() => {
        jest.mocked(getTrustedReadableDirectories).mockReturnValue([trustedDir]);
        jest.mocked(mockFileAccessService.realPath).mockImplementation(async (p: string) => {
          if (p === symlinkPath) return targetPath;
          return p;
        });
        jest.mocked(mockFileAccessService.getText).mockResolvedValue(targetContent);

        action = createFakePartial<ReadFileAction>({
          runReadFile: { filepath: symlinkPath },
        });
      });

      it('reads the resolved target', async () => {
        const result = await readFileHandler.execute(action, workflowActionContext);

        expect(result.response).toBe(targetContent);
        expect(result.error).toBe('');
      });
    });

    describe('when the trusted directory itself is a symlink', () => {
      const trustedDir = '/home/testuser/.agents';
      const canonicalTrustedDir = '/home/testuser/dotfiles/agents';
      const requestedPath = '/home/testuser/.agents/skills/foo/SKILL.md';
      const canonicalPath = '/home/testuser/dotfiles/agents/skills/foo/SKILL.md';
      const content = '# Content';

      beforeEach(() => {
        jest.mocked(getTrustedReadableDirectories).mockReturnValue([trustedDir]);
        jest.mocked(mockFileAccessService.realPath).mockImplementation(async (p: string) => {
          if (p === trustedDir) return canonicalTrustedDir;
          if (p === requestedPath) return canonicalPath;
          return p;
        });
        jest.mocked(mockFileAccessService.getText).mockResolvedValue(content);

        action = createFakePartial<ReadFileAction>({
          runReadFile: { filepath: requestedPath },
        });
      });

      it('reads files through the symlinked trusted directory', async () => {
        const result = await readFileHandler.execute(action, workflowActionContext);

        expect(result.response).toBe(content);
        expect(result.error).toBe('');
      });
    });

    describe('when filepath is an absolute path inside a configured workspace folder', () => {
      const otherWorkspacePath = '/path/to/other';
      const otherWorkspaceUri = 'file:///path/to/other';
      const skillInOtherWorkspace = '/path/to/other/.agents/skills/b/SKILL.md';

      beforeEach(() => {
        jest.mocked(getTrustedReadableDirectories).mockReturnValue([]);
        jest.mocked(mockConfigService.get).mockReturnValue(
          createFakePartial<ClientConfig>({
            workspaceFolders: [
              { uri: 'file:///path/to/folder', name: 'active' },
              { uri: otherWorkspaceUri, name: 'other' },
            ],
          }),
        );
        action = createFakePartial<ReadFileAction>({
          runReadFile: { filepath: skillInOtherWorkspace },
        });
      });

      // The active workspace is /path/to/folder, but the skill lives in /path/to/other.
      it('resolves against the containing folder, not the active one', async () => {
        const result = await readFileHandler.execute(action, workflowActionContext);

        expect(assertAccessibleFile).toHaveBeenCalledWith(
          '.agents/skills/b/SKILL.md',
          otherWorkspacePath,
          expect.any(Object),
          expect.any(Object),
          otherWorkspaceUri,
        );
        expect(result).toEqual({ response: fileContent, error: '' });
      });

      it('takes the repo path so FileStateTracker is preserved (not the trusted bypass)', async () => {
        await readFileHandler.execute(action, workflowActionContext);

        expect(mockFileStateTracker.recordFileRead).toHaveBeenCalled();
      });
    });

    describe('when an absolute path is outside every workspace folder and trusted dir', () => {
      beforeEach(() => {
        jest.mocked(getTrustedReadableDirectories).mockReturnValue(['/home/testuser/.agents']);
        jest.mocked(mockConfigService.get).mockReturnValue(
          createFakePartial<ClientConfig>({
            workspaceFolders: [{ uri: 'file:///path/to/folder', name: 'active' }],
          }),
        );
        action = createFakePartial<ReadFileAction>({
          runReadFile: { filepath: '/etc/passwd' },
        });
      });

      it('denies the read so the capability stays bounded', async () => {
        const result = await readFileHandler.execute(action, workflowActionContext);

        expect(result.error).toContain('Access denied');
        expect(mockFileAccessService.getText).not.toHaveBeenCalled();
      });
    });

    describe('file read state tracking', () => {
      describe('when read is successful', () => {
        it('should record file read in file state tracker', async () => {
          await readFileHandler.execute(action, workflowActionContext);

          expect(mockFileStateTracker.recordFileRead).toHaveBeenCalledWith(
            fullFilePath,
            fileContent,
          );
        });
      });

      describe('when file read fails', () => {
        beforeEach(() => {
          const error = new Error('File not found');
          jest.mocked(mockFileAccessService.getText).mockRejectedValue(error);
        });

        it('should not record file read', async () => {
          await readFileHandler.execute(action, workflowActionContext);

          expect(mockFileStateTracker.recordFileRead).not.toHaveBeenCalled();
        });
      });
    });

    describe('when the workspace is a virtual filesystem', () => {
      beforeEach(() => {
        workflowActionContext = createFakePartial<WorkflowActionContext>({
          workspaceFolderPath: '/demo',
          workspaceFolderUri: 'testfs:/demo',
          fileStateTracker: mockFileStateTracker,
        });
      });

      it('looks up the file by its virtual URI rather than a file:// path', async () => {
        await readFileHandler.execute(action, workflowActionContext);

        expect(mockFileAccessService.getText).toHaveBeenCalledWith('testfs:/demo/some/file.ts');
      });
    });
  });
});

describe('ReadFileFormatter', () => {
  let formatter: ReadFileFormatter;

  beforeEach(() => {
    formatter = new ReadFileFormatter();
  });

  it('maps a valid file_path to the read_file display', () => {
    expect(formatter.format({ file_path: 'src/test.ts' })).toEqual({
      tool: 'read_file',
      filepath: 'src/test.ts',
    });
  });

  it('includes offset and limit when present', () => {
    expect(formatter.format({ file_path: 'src/test.ts', offset: 10, limit: 20 })).toEqual({
      tool: 'read_file',
      filepath: 'src/test.ts',
      offset: 10,
      limit: 20,
    });
  });

  it.each([
    ['file_path missing', {}],
    ['file_path a number', { file_path: 42 }],
    ['offset a string', { file_path: 'src/test.ts', offset: '10' }],
    ['limit a string', { file_path: 'src/test.ts', limit: '20' }],
  ])('throws on %s', (_label, args) => {
    expect(() => formatter.format(args)).toThrow();
  });
});
