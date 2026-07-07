import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { FileAccessService } from '@gitlab-org/fs';
import { WorkflowAction } from '../clients/types';
import { assertAccessibleFile } from './assert_accessible_file';
import { MakeDirectoryActionHandler, MakeDirectoryAction, MakeDirectoryFormatter } from './mkdir';
import { WorkflowActionContext } from './index';

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(),
}));

jest.mock('./assert_accessible_file', () => ({
  assertAccessibleFile: jest.fn(),
}));

describe('MakeDirectoryActionHandler', () => {
  let makeDirectoryHandler: MakeDirectoryActionHandler;
  let mockLogger: TestLogger;
  let mockFileAccessService: FileAccessService;
  let abortController: AbortController;

  const workspaceFolderPath = '/path/to/folder';
  const directoryPath = 'some/new/directory';
  const fullDirectoryPath = join(workspaceFolderPath, directoryPath);
  let workflowActionContext: WorkflowActionContext;

  beforeEach(() => {
    mockLogger = new TestLogger();
    mockFileAccessService = createFakePartial<FileAccessService>({
      realPath: jest.fn().mockResolvedValue(fullDirectoryPath),
    });

    makeDirectoryHandler = new MakeDirectoryActionHandler(mockLogger, [mockFileAccessService]);

    abortController = new AbortController();

    workflowActionContext = createFakePartial<WorkflowActionContext>({
      workspaceFolderPath,
      abortSignal: abortController.signal,
    });

    jest.mocked(mkdir).mockResolvedValue(undefined);
  });

  describe('canHandle', () => {
    it('returns true for mkdir actions', () => {
      const action = createFakePartial<WorkflowAction>({
        mkdir: { directory_path: directoryPath },
      });

      expect(makeDirectoryHandler.canHandle(action)).toBe(true);
    });

    it('returns false for other actions', () => {
      const action: WorkflowAction = {
        someOtherAction: {},
      } as unknown as WorkflowAction;

      expect(makeDirectoryHandler.canHandle(action)).toBe(false);
    });
  });

  describe('execute', () => {
    let action: MakeDirectoryAction;

    beforeEach(() => {
      action = createFakePartial<MakeDirectoryAction>({
        mkdir: { directory_path: directoryPath },
      });
    });

    it('creates the directory at the specified path, recursively', async () => {
      const { response, error } = await makeDirectoryHandler.execute(action, workflowActionContext);

      expect(mkdir).toHaveBeenCalledWith(fullDirectoryPath, { recursive: true });
      expect(response).toBe('Directory created successfully: "some/new/directory"');
      expect(error).toBe('');
    });

    it('validates directory is accessible', async () => {
      await makeDirectoryHandler.execute(action, workflowActionContext);

      expect(assertAccessibleFile).toHaveBeenCalledWith(
        directoryPath,
        workspaceFolderPath,
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('handles mkdir errors', async () => {
      const err = new Error('Permission denied');
      jest.mocked(mkdir).mockRejectedValue(err);

      const { error, response } = await makeDirectoryHandler.execute(action, workflowActionContext);

      expect(error).toBe(err.message);
      expect(response).toBe('');
    });

    it('handles non-Error objects thrown from mkdir', async () => {
      const nonErrorMessage = 'Something went wrong';
      jest.mocked(mkdir).mockRejectedValue(nonErrorMessage);

      const { error, response } = await makeDirectoryHandler.execute(action, workflowActionContext);

      expect(error).toBe(nonErrorMessage);
      expect(response).toBe('');
    });

    it('handles assertAccessibleFile throwing errors', async () => {
      const err = new Error('Path is outside the workspace folder');
      jest.mocked(assertAccessibleFile).mockImplementation(() => {
        throw err;
      });

      const { error, response } = await makeDirectoryHandler.execute(action, workflowActionContext);

      expect(error).toBe(err.message);
      expect(response).toBe('');
      expect(mkdir).not.toHaveBeenCalled();
    });

    describe('when abortSignal is aborted', () => {
      beforeEach(() => {
        jest.mocked(assertAccessibleFile).mockImplementation(async () => {
          // Do nothing - valid directory
        });
      });

      it('throws and stops execution before creating directory', async () => {
        const abortedController = new AbortController();
        abortedController.abort();

        const abortedContext = createFakePartial<WorkflowActionContext>({
          workspaceFolderPath,
          abortSignal: abortedController.signal,
        });

        const { error, response } = await makeDirectoryHandler.execute(action, abortedContext);

        expect(error).toBe('AbortError: This operation was aborted');
        expect(response).toBe('');
        expect(mkdir).not.toHaveBeenCalled();
      });
    });
  });
});

describe('MakeDirectoryFormatter', () => {
  let formatter: MakeDirectoryFormatter;

  beforeEach(() => {
    formatter = new MakeDirectoryFormatter();
  });

  it('maps a valid directory_path to the mkdir display', () => {
    expect(formatter.format({ directory_path: 'src/new' })).toEqual({
      tool: 'mkdir',
      path: 'src/new',
    });
  });

  it.each([
    ['directory_path missing', {}],
    ['directory_path a number', { directory_path: 42 }],
  ])('throws on %s', (_label, args) => {
    expect(() => formatter.format(args)).toThrow();
  });
});
