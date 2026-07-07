import { join } from 'node:path';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { FileAccessService, FileNotFoundError } from '@gitlab-org/fs';
import { WorkflowAction } from '../clients/types';
import { assertAccessibleFile } from './assert_accessible_file';
import { FileStateTracker } from './file_state_tracker';
import { WriteFileActionHandler, WriteFileAction, WriteFileFormatter } from './write_file';
import { WorkflowActionContext } from './index';

jest.mock('./assert_accessible_file', () => ({
  assertAccessibleFile: jest.fn(),
}));

describe('WriteFileActionHandler', () => {
  let writeFileHandler: WriteFileActionHandler;
  let mockLogger: TestLogger;
  let mockFileAccessService: FileAccessService;
  let mockFileStateTracker: FileStateTracker;
  let abortController: AbortController;

  const folderName = '/path/to/folder';
  const filepath = 'some/file.ts';
  const contents = 'file content to write';
  const fullFilePath = join(folderName, filepath);
  let workflowActionContext: WorkflowActionContext;

  beforeEach(() => {
    mockLogger = new TestLogger();
    mockFileAccessService = createFakePartial<FileAccessService>({
      getText: jest
        .fn()
        .mockRejectedValue(new FileNotFoundError(fullFilePath, new Error('ENOENT'))),
      writeFile: jest.fn().mockResolvedValue(undefined),
    });
    mockFileStateTracker = createFakePartial<FileStateTracker>({
      recordFileRead: jest.fn().mockReturnValue(undefined),
    });

    writeFileHandler = new WriteFileActionHandler(mockLogger, [mockFileAccessService]);

    abortController = new AbortController();
    workflowActionContext = createFakePartial<WorkflowActionContext>({
      workspaceFolderPath: folderName,
      fileStateTracker: mockFileStateTracker,
      abortSignal: abortController.signal,
    });
  });

  describe('canHandle', () => {
    it('returns true for runWriteFile actions', () => {
      const action = createFakePartial<WorkflowAction>({
        runWriteFile: { filepath, contents },
      });

      expect(writeFileHandler.canHandle(action)).toBe(true);
    });

    it('returns false for other actions', () => {
      const action: WorkflowAction = {
        someOtherAction: {},
      } as unknown as WorkflowAction;

      expect(writeFileHandler.canHandle(action)).toBe(false);
    });
  });

  describe('execute', () => {
    let action: WriteFileAction;

    beforeEach(() => {
      action = createFakePartial<WriteFileAction>({
        runWriteFile: { filepath, contents },
      });
    });

    it('writes the file with the given content at the specified path', async () => {
      const { response } = await writeFileHandler.execute(action, workflowActionContext);

      expect(mockFileAccessService.writeFile).toHaveBeenCalledWith(fullFilePath, contents);
      expect(response).toBe('File written successfully');
    });

    it('joins the folder name and file path correctly', async () => {
      await writeFileHandler.execute(action, workflowActionContext);

      expect(mockFileAccessService.writeFile).toHaveBeenCalledWith(
        join(folderName, filepath),
        contents,
      );
    });

    it('handles file write errors', async () => {
      const err = new Error('Failed to write file');
      jest.mocked(mockFileAccessService.writeFile).mockRejectedValue(err);

      const { error } = await writeFileHandler.execute(action, workflowActionContext);
      expect(error).toBe(err.message);
    });

    it('validates file is accessible', async () => {
      await writeFileHandler.execute(action, workflowActionContext);

      expect(assertAccessibleFile).toHaveBeenCalledWith(
        filepath,
        folderName,
        expect.any(Object),
        expect.any(Object),
        undefined,
      );
    });

    describe('when file already exists', () => {
      const existingContent = 'existing file content';

      beforeEach(() => {
        jest.mocked(mockFileAccessService.getText).mockResolvedValue(existingContent);
      });

      it('should return error when file already exists', async () => {
        const { error, response } = await writeFileHandler.execute(action, workflowActionContext);

        expect(error).toBe(
          `File "${filepath}" already exists. Use the edit_file tool to modify existing files.`,
        );
        expect(response).toBe('');
        expect(mockFileAccessService.writeFile).not.toHaveBeenCalled();
      });
    });

    describe('when write succeeds', () => {
      beforeEach(() => {
        jest
          .mocked(mockFileAccessService.getText)
          .mockRejectedValueOnce(new FileNotFoundError(fullFilePath, new Error('ENOENT'))) // Initial check
          .mockResolvedValueOnce(contents); // Read after write
      });

      it('should update file state', async () => {
        await writeFileHandler.execute(action, workflowActionContext);

        expect(mockFileStateTracker.recordFileRead).toHaveBeenCalledWith(fullFilePath, contents);
      });
    });

    describe('when the file state update fails', () => {
      beforeEach(() => {
        jest
          .mocked(mockFileAccessService.getText)
          .mockRejectedValueOnce(new FileNotFoundError(fullFilePath, new Error('ENOENT'))) // Initial check
          .mockRejectedValueOnce(new Error('Failed to read updated content')); // Read after write fails
      });

      it('should handle failure gracefully', async () => {
        const { response, error } = await writeFileHandler.execute(action, workflowActionContext);

        // Write should still succeed even if state update fails
        expect(response).toBe('File written successfully');
        expect(error).toBe('');
        expect(mockFileAccessService.writeFile).toHaveBeenCalled();
      });
    });

    describe('when abortSignal is aborted', () => {
      it('throws and stops execution before writing file', async () => {
        abortController.abort();

        const { error } = await writeFileHandler.execute(action, workflowActionContext);

        expect(error).toBe('AbortError: This operation was aborted');
        expect(mockFileAccessService.writeFile).not.toHaveBeenCalled();
      });
    });

    describe('when file access check fails with unexpected error', () => {
      it('should throw the error', async () => {
        const unexpectedError = new Error('Permission denied');
        jest.mocked(mockFileAccessService.getText).mockRejectedValue(unexpectedError);

        await expect(writeFileHandler.execute(action, workflowActionContext)).rejects.toThrow(
          'Permission denied',
        );
      });
    });
  });
});

describe('WriteFileFormatter', () => {
  let formatter: WriteFileFormatter;

  beforeEach(() => {
    formatter = new WriteFileFormatter();
  });

  it('maps valid args to the create_file_with_contents display', () => {
    expect(formatter.format({ file_path: 'src/test.ts', contents: 'hello' })).toEqual({
      tool: 'create_file_with_contents',
      filepath: 'src/test.ts',
      content: 'hello',
    });
  });

  it.each([
    ['both fields missing', {}],
    ['contents missing', { file_path: 'src/test.ts' }],
    ['file_path missing', { contents: 'hello' }],
    ['file_path a number', { file_path: 42, contents: 'hello' }],
    ['contents a number', { file_path: 'src/test.ts', contents: 42 }],
  ])('throws on %s', (_label, args) => {
    expect(() => formatter.format(args)).toThrow();
  });
});
