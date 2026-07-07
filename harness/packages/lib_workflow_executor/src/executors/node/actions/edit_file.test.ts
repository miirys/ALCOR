import { join } from 'node:path';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver-protocol';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { FileAccessService } from '@gitlab-org/fs';
import { DocumentQualityService } from '@gitlab-org/document';
import { FeatureFlagService } from '@gitlab-org/core';
import type { WorkflowAction } from '../clients/types';
import { assertAccessibleFile } from './assert_accessible_file';
import {
  FileStateTracker,
  DuoFileNotReadError,
  DuoFileModifiedSinceLastReadError,
} from './file_state_tracker';
import { EditFileActionHandler, type EditFileAction } from './edit_file';
import type { WorkflowActionContext } from './index';

jest.mock('./assert_accessible_file', () => ({
  assertAccessibleFile: jest.fn(),
}));

describe('EditFileActionHandler', () => {
  let editFileHandler: EditFileActionHandler;
  let mockLogger: TestLogger;
  let mockFileAccessService: FileAccessService;
  let mockFileStateTracker: FileStateTracker;
  let mockDocumentQualityService: DocumentQualityService;
  let mockFeatureFlagService: FeatureFlagService;

  const workspaceFolderPath = '/path/to/folder';
  const filepath = 'some/file.ts';
  const oldString = 'old content';
  const newString = 'new content';
  const fullFilePath = join(workspaceFolderPath, filepath);
  const fileContent = 'file with old content to edit';
  let workflowActionContext: WorkflowActionContext;

  beforeEach(() => {
    mockLogger = new TestLogger();
    mockFileAccessService = createFakePartial<FileAccessService>({
      getText: jest.fn().mockResolvedValue(fileContent),
      updateFile: jest.fn().mockResolvedValue(undefined),
    });
    mockFileStateTracker = createFakePartial<FileStateTracker>({
      recordFileRead: jest.fn().mockReturnValue(undefined),
      assertFileNotModifiedSinceLastRead: jest.fn(),
    });
    mockDocumentQualityService = createFakePartial<DocumentQualityService>({
      getDiagnostics: jest.fn().mockResolvedValue([]),
    });
    mockFeatureFlagService = createFakePartial<FeatureFlagService>({
      isClientFlagEnabled: jest.fn().mockReturnValue(true), // Default to enabled for existing tests
    });

    editFileHandler = new EditFileActionHandler(
      mockLogger,
      [mockFileAccessService],
      mockDocumentQualityService,
      mockFeatureFlagService,
    );

    workflowActionContext = createFakePartial<WorkflowActionContext>({
      workspaceFolderPath,
      fileStateTracker: mockFileStateTracker,
      abortSignal: new AbortController().signal,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('canHandle', () => {
    it('returns true for runEditFile actions', () => {
      const action = createFakePartial<WorkflowAction>({
        runEditFile: { filepath, oldString, newString },
      });

      expect(editFileHandler.canHandle(action)).toBe(true);
    });

    it('returns false for other actions', () => {
      const action: WorkflowAction = {
        someOtherAction: {},
      } as unknown as WorkflowAction;

      expect(editFileHandler.canHandle(action)).toBe(false);
    });
  });

  describe('execute', () => {
    let action: EditFileAction;

    beforeEach(() => {
      action = createFakePartial<EditFileAction>({
        runEditFile: { filepath, oldString, newString },
      });
    });

    it('reads, edits, and writes the file when changes are found', async () => {
      // Mock a content replacement that changes the content
      const contentWithOldString = `file with ${oldString} to edit`;
      jest.mocked(mockFileAccessService.getText).mockResolvedValue(contentWithOldString);

      const { response } = await editFileHandler.execute(action, workflowActionContext);

      expect(mockFileAccessService.getText).toHaveBeenCalledWith(fullFilePath);
      expect(mockFileAccessService.updateFile).toHaveBeenCalledWith(
        fullFilePath,
        expect.arrayContaining([
          {
            newText: 'new content',
            range: { end: { character: 21, line: 0 }, start: { character: 10, line: 0 } },
          },
        ]),
      );
      expect(response).toBe(`File '${filepath}' has been updated.`);
    });

    it('validates file is accessible', async () => {
      await editFileHandler.execute(action, workflowActionContext);

      expect(assertAccessibleFile).toHaveBeenCalledWith(
        filepath,
        workspaceFolderPath,
        expect.any(Object),
        expect.any(Object),
        undefined,
      );
    });

    it('applies edits when the file uses CRLF but oldString uses LF', async () => {
      const crlfContent = `function greet(name) {\r\n  const greeting = 'Hello';\r\n  return greeting;\r\n}`;
      const lfAction = createFakePartial<EditFileAction>({
        runEditFile: {
          filepath,
          oldString: `  const greeting = 'Hello';\n  return greeting;`,
          newString: `  const greeting = 'Hi';\n  return greeting;`,
        },
      });
      jest.mocked(mockFileAccessService.getText).mockResolvedValue(crlfContent);

      const { response, error } = await editFileHandler.execute(lfAction, workflowActionContext);

      expect(error).toBe('');
      expect(response).toBe(`File '${filepath}' has been updated.`);
      expect(mockFileAccessService.updateFile).toHaveBeenCalledTimes(1);
    });

    it('preserves CRLF line endings in the written replacement text', async () => {
      const crlfContent = `function greet(name) {\r\n  const greeting = 'Hello';\r\n  return greeting;\r\n}`;
      const lfAction = createFakePartial<EditFileAction>({
        runEditFile: {
          filepath,
          oldString: `  const greeting = 'Hello';\n  return greeting;`,
          newString: `  const greeting = 'Hi';\n  return greeting;`,
        },
      });
      jest.mocked(mockFileAccessService.getText).mockResolvedValue(crlfContent);

      await editFileHandler.execute(lfAction, workflowActionContext);

      const [, textEdits] = jest.mocked(mockFileAccessService.updateFile).mock.calls[0];
      expect(textEdits[0].newText).toBe(`  const greeting = 'Hi';\r\n  return greeting;`);
    });

    it('does not write the file when no changes are found', async () => {
      // Mock a content that won't be modified by the replacement
      const contentWithoutTargetString = 'file without the target string';
      jest.mocked(mockFileAccessService.getText).mockResolvedValue(contentWithoutTargetString);

      const { response } = await editFileHandler.execute(action, workflowActionContext);

      expect(mockFileAccessService.getText).toHaveBeenCalledWith(fullFilePath);
      expect(mockFileAccessService.updateFile).not.toHaveBeenCalled();
      expect(response).toBe(`No changes made to '${filepath}' as '${oldString}' not found`);
    });

    it('returns error when multiple matches are found', async () => {
      const contentWithMultipleMatches = `file with ${oldString} and another ${oldString} to edit`;
      jest.mocked(mockFileAccessService.getText).mockResolvedValue(contentWithMultipleMatches);

      const { error, response } = await editFileHandler.execute(action, workflowActionContext);

      expect(mockFileAccessService.updateFile).not.toHaveBeenCalled();
      expect(error).toBe(
        'Ambiguous match: "oldText" appears multiple times. Provide more surrounding code to make the replacement match unique.',
      );
      expect(response).toBe('');
    });

    it('handles file read errors appropriately', async () => {
      const err = new Error('ENOENT: file not found');
      jest.mocked(mockFileAccessService.getText).mockRejectedValue(err);

      const { error } = await editFileHandler.execute(action, workflowActionContext);

      expect(error).toBe(`Unable to open file: ${err.message}`);
    });

    it('handles write errors appropriately', async () => {
      // Setup content with the oldString to ensure replacement happens
      const contentWithOldString = `file with ${oldString} to edit`;
      jest.mocked(mockFileAccessService.getText).mockResolvedValue(contentWithOldString);

      const err = new Error('Failed to write file');
      jest.mocked(mockFileAccessService.updateFile).mockRejectedValue(err);

      const { error } = await editFileHandler.execute(action, workflowActionContext);

      expect(error).toBe(err.message);
    });

    it.each([
      // GitLab Duo configuration
      '.gitlab/duo/chat-rules.md',
      '.gitlab\\duo\\chat-rules.md',
      '.gitlab/duo/subfolder/config.yml',
      '.gitlab/duo/sub/folder/deep/config.yml',
      '/Users/u/project/.gitlab/duo/xyz.md',
      'C:\\Workspace\\.gitlab\\duo\\file.txt',
      'some/path/.gitlab/duo/config.yml',
      // Git directory and configuration
      '.git/config',
      '.git\\config',
      '.git/hooks/pre-commit',
      '.git/hooks\\post-receive',
      'project/.git/config',
      'C:\\Project\\.git\\hooks\\pre-push',
      // Eclipse metadata
      '.metadata/log',
      '.metadata\\workspace.xml',
      'project/.metadata/settings.xml',
      // JetBrains IDE configuration
      '.idea/workspace.xml',
      '.idea\\modules.xml',
      '.idea/vcs.xml',
      'project/.idea/compiler.xml',
      'C:\\Project\\.idea\\encodings.xml',
      // VS Code workspace settings
      '.vscode/settings.json',
      '.vscode\\settings.json',
      'project/.vscode/settings.json',
      // Neovim configuration
      '.nvimrc',
      '.vimrc',
      'init.lua',
      'project/.nvimrc',
      // Visual Studio configuration
    ])('prevents editing sensitive configuration files: %s', async (invalidPath) => {
      const testAction = createFakePartial<EditFileAction>({
        runEditFile: { filepath: invalidPath, oldString, newString },
      });

      const { error, response } = await editFileHandler.execute(testAction, workflowActionContext);

      expect(error).toBe(
        'You are not allowed to change editor configuration files or sensitive directories',
      );
      expect(response).toBe('');
      expect(mockFileAccessService.getText).not.toHaveBeenCalled();
      expect(mockFileAccessService.updateFile).not.toHaveBeenCalled();
    });

    it.each([
      // GitLab files (but not duo folder)
      '.gitlab/ci/build.yml',
      '.gitlab/config.yml',
      '.gitlabXduo/file.txt',
      '.gitlab/duo-config.yml',
      '.gitlab/ci/duo-build.yml',
      'hello.gitlab/duo/aaa',
      // Regular source files
      'src/main.ts',
      'lib/utils.js',
      'README.md',
      'package.json',
      // Files with similar names but not blocked
      'git-config.txt',
      'idea-notes.xml',
      'vscode-extension.json',
      'metadata.json',
      'nvim-config.lua',
      // Files in subdirectories with similar names
      'docs/.git-workflow.md',
      'config/idea-settings.xml',
      'scripts/vscode-setup.json',
    ])('allows editing non-sensitive files: %s', async (validPath) => {
      const testAction = createFakePartial<EditFileAction>({
        runEditFile: { filepath: validPath, oldString, newString },
      });

      const contentWithOldString = `file with ${oldString} to edit`;
      jest.mocked(mockFileAccessService.getText).mockResolvedValue(contentWithOldString);

      const { response } = await editFileHandler.execute(testAction, workflowActionContext);

      expect(mockFileAccessService.getText).toHaveBeenCalled();
      expect(mockFileAccessService.updateFile).toHaveBeenCalled();
      expect(response).toBe(`File '${validPath}' has been updated.`);
    });

    describe('diagnostics IDE integration', () => {
      beforeEach(() => {
        const contentWithOldString = `file with ${oldString} to edit`;
        jest.mocked(mockFileAccessService.getText).mockResolvedValue(contentWithOldString);
      });

      describe('when editFileDiagnosticsResponse feature flag is disabled', () => {
        beforeEach(() => {
          jest.mocked(mockFeatureFlagService.isClientFlagEnabled).mockReturnValue(false);
        });

        it('should return basic success message without calling diagnostics service', async () => {
          const { response, error } = await editFileHandler.execute(action, workflowActionContext);

          expect(mockDocumentQualityService.getDiagnostics).not.toHaveBeenCalled();
          expect(response).toBe(`File '${filepath}' has been updated.`);
          expect(error).toBe('');
        });

        it('should still perform file operations normally', async () => {
          await editFileHandler.execute(action, workflowActionContext);

          expect(mockFileAccessService.getText).toHaveBeenCalledWith(fullFilePath);
          expect(mockFileAccessService.updateFile).toHaveBeenCalled();
        });
      });

      describe('when editFileDiagnosticsResponse feature flag is enabled', () => {
        beforeEach(() => {
          jest.mocked(mockFeatureFlagService.isClientFlagEnabled).mockReturnValue(true);
        });

        describe('when no diagnostics are found', () => {
          beforeEach(() => {
            jest.mocked(mockDocumentQualityService.getDiagnostics).mockResolvedValue([]);
          });

          it('should return basic success message without diagnostic information', async () => {
            const { response, error } = await editFileHandler.execute(
              action,
              workflowActionContext,
            );

            expect(response).toBe(`File '${filepath}' has been updated.`);
            expect(error).toBe('');
          });
        });

        describe('when diagnostics are found but do not overlap with edited ranges', () => {
          beforeEach(() => {
            const nonOverlappingDiagnostic = createFakePartial<Diagnostic>({
              range: createFakePartial<Range>({
                start: { line: 5, character: 0 },
                end: { line: 5, character: 10 },
              }),
              message: 'Some error outside edited range',
              severity: DiagnosticSeverity.Error,
            });

            jest
              .mocked(mockDocumentQualityService.getDiagnostics)
              .mockResolvedValue([nonOverlappingDiagnostic]);
          });

          it('should return basic success message without diagnostic information', async () => {
            const { response, error } = await editFileHandler.execute(
              action,
              workflowActionContext,
            );

            expect(response).toBe(`File '${filepath}' has been updated.`);
            expect(error).toBe('');
          });
        });

        describe('when diagnostics overlap with edited ranges', () => {
          describe('with a single diagnostic', () => {
            beforeEach(() => {
              const overlappingDiagnostic = createFakePartial<Diagnostic>({
                range: createFakePartial<Range>({
                  start: { line: 0, character: 10 },
                  end: { line: 0, character: 21 },
                }),
                message: 'Syntax error in edited code',
                severity: DiagnosticSeverity.Error,
                source: 'typescript',
                code: 'TS2304',
              });

              jest
                .mocked(mockDocumentQualityService.getDiagnostics)
                .mockResolvedValue([overlappingDiagnostic]);
            });

            it('should include diagnostic information in response with singular form', async () => {
              const { response, error } = await editFileHandler.execute(
                action,
                workflowActionContext,
              );

              expect(response).toBe(
                `File '${filepath}' has been updated. IDE reported 1 diagnostic issue in the edited range which may require additional changes to fix:\n* 1: Syntax error in edited code [0:10 - 0:21] (source: "typescript", code: "TS2304")`,
              );
              expect(error).toBe('');
            });
          });

          describe('with multiple diagnostics', () => {
            beforeEach(() => {
              const diagnostic1 = createFakePartial<Diagnostic>({
                range: createFakePartial<Range>({
                  start: { line: 0, character: 10 },
                  end: { line: 0, character: 15 },
                }),
                message: 'First error',
                severity: DiagnosticSeverity.Error,
                source: 'eslint',
                code: 'no-unused-vars',
              });

              const diagnostic2 = createFakePartial<Diagnostic>({
                range: createFakePartial<Range>({
                  start: { line: 0, character: 16 },
                  end: { line: 0, character: 21 },
                }),
                message: 'Second warning',
                severity: DiagnosticSeverity.Warning,
                source: 'typescript',
              });

              jest
                .mocked(mockDocumentQualityService.getDiagnostics)
                .mockResolvedValue([diagnostic1, diagnostic2]);
            });

            it('should include all diagnostic information in response with plural form', async () => {
              const { response, error } = await editFileHandler.execute(
                action,
                workflowActionContext,
              );

              expect(response).toBe(
                `File '${filepath}' has been updated. IDE reported 2 diagnostic issues in the edited range which may require additional changes to fix:\n* 1: First error [0:10 - 0:15] (source: "eslint", code: "no-unused-vars")\n* 2: Second warning [0:16 - 0:21] (source: "typescript")`,
              );
              expect(error).toBe('');
            });
          });

          describe('with mixed overlapping and non-overlapping diagnostics', () => {
            beforeEach(() => {
              const overlappingDiagnostic = createFakePartial<Diagnostic>({
                range: createFakePartial<Range>({
                  start: { line: 0, character: 12 },
                  end: { line: 0, character: 18 },
                }),
                message: 'Error in edited range',
                severity: DiagnosticSeverity.Error,
              });

              const nonOverlappingDiagnostic = createFakePartial<Diagnostic>({
                range: createFakePartial<Range>({
                  start: { line: 5, character: 0 },
                  end: { line: 5, character: 10 },
                }),
                message: 'Error outside edited range',
                severity: DiagnosticSeverity.Error,
              });

              jest
                .mocked(mockDocumentQualityService.getDiagnostics)
                .mockResolvedValue([overlappingDiagnostic, nonOverlappingDiagnostic]);
            });

            it('should only include overlapping diagnostics in response', async () => {
              const { response, error } = await editFileHandler.execute(
                action,
                workflowActionContext,
              );

              expect(response).toBe(
                `File '${filepath}' has been updated. IDE reported 1 diagnostic issue in the edited range which may require additional changes to fix:\n* 1: Error in edited range [0:12 - 0:18]`,
              );
              expect(error).toBe('');
            });
          });
        });

        describe('when diagnostic retrieval fails', () => {
          beforeEach(() => {
            jest
              .mocked(mockDocumentQualityService.getDiagnostics)
              .mockRejectedValue(new Error(`ruh roh, couldn't get diagnostics!`));
          });

          it('should continue with file update and return basic success message', async () => {
            const { response, error } = await editFileHandler.execute(
              action,
              workflowActionContext,
            );

            expect(response).toBe(`File '${filepath}' has been updated.`);
            expect(error).toBe('');
          });
        });

        describe('when abortSignal is aborted', () => {
          it('throws and stops execution before writing file', async () => {
            const abortController = new AbortController();
            const abortedContext = createFakePartial<WorkflowActionContext>({
              workspaceFolderPath,
              fileStateTracker: mockFileStateTracker,
              abortSignal: abortController.signal,
            });

            abortController.abort();

            const { error } = await editFileHandler.execute(action, abortedContext);

            expect(error).toEqual('AbortError: This operation was aborted');
            expect(mockFileAccessService.updateFile).not.toHaveBeenCalled();
          });
        });

        describe('edge cases', () => {
          it('should handle diagnostics with zero-width ranges that overlap', async () => {
            const zeroWidthDiagnostic = createFakePartial<Diagnostic>({
              range: createFakePartial<Range>({
                start: { line: 0, character: 15 },
                end: { line: 0, character: 15 },
              }),
              message: 'Zero-width diagnostic',
              severity: DiagnosticSeverity.Information,
            });

            jest
              .mocked(mockDocumentQualityService.getDiagnostics)
              .mockResolvedValue([zeroWidthDiagnostic]);

            const { response } = await editFileHandler.execute(action, workflowActionContext);

            expect(response).toContain('Zero-width diagnostic');
          });

          it('should handle diagnostics with multi-line ranges that overlap', async () => {
            const multiLineDiagnostic = createFakePartial<Diagnostic>({
              range: createFakePartial<Range>({
                start: { line: 0, character: 10 },
                end: { line: 2, character: 5 },
              }),
              message: 'Multi-line diagnostic',
              severity: DiagnosticSeverity.Warning,
            });

            jest
              .mocked(mockDocumentQualityService.getDiagnostics)
              .mockResolvedValue([multiLineDiagnostic]);

            const { response } = await editFileHandler.execute(action, workflowActionContext);

            expect(response).toContain('Multi-line diagnostic [0:10 - 2:5]');
          });
        });
      });
    });

    describe('file state tracking', () => {
      beforeEach(() => {
        jest.mocked(assertAccessibleFile).mockResolvedValue(undefined);
      });

      describe('when file has been read before editing', () => {
        beforeEach(() => {
          jest
            .mocked(mockFileAccessService.getText)
            .mockResolvedValue(`file with ${oldString} to edit`);
          jest
            .mocked(mockFileStateTracker.assertFileNotModifiedSinceLastRead)
            .mockImplementation(() => {
              // No error thrown - validation passes
            });
        });

        it('should proceed with edit', async () => {
          const { response, error } = await editFileHandler.execute(action, workflowActionContext);

          expect(error).toBe('');
          expect(response).toBe(`File '${filepath}' has been updated.`);
        });
      });

      describe('when file edit succeeds', () => {
        const updatedContent = `file with ${newString} to edit`;

        beforeEach(() => {
          jest
            .mocked(mockFileAccessService.getText)
            .mockResolvedValueOnce(`file with ${oldString} to edit`) // Initial read
            .mockResolvedValueOnce(updatedContent); // Read after update
          jest
            .mocked(mockFileStateTracker.assertFileNotModifiedSinceLastRead)
            .mockImplementation(() => {
              // No error thrown - validation passes
            });
        });

        it('should update file state', async () => {
          await editFileHandler.execute(action, workflowActionContext);

          expect(mockFileStateTracker.recordFileRead).toHaveBeenCalledWith(
            fullFilePath,
            updatedContent,
          );
        });
      });

      describe('when the file state update fails', () => {
        beforeEach(() => {
          jest
            .mocked(mockFileAccessService.getText)
            .mockResolvedValueOnce(`file with ${oldString} to edit`) // Initial read
            .mockRejectedValueOnce(new Error('Failed to read updated content')); // Read after update fails
          jest
            .mocked(mockFileStateTracker.assertFileNotModifiedSinceLastRead)
            .mockImplementation(() => {
              // No error thrown - validation passes
            });
        });

        it('should handle failure gracefully', async () => {
          const { response, error } = await editFileHandler.execute(action, workflowActionContext);

          // Edit action should still succeed even if state update fails
          expect(response).toBe(`File '${filepath}' has been updated.`);
          expect(error).toBe('');
          expect(mockFileAccessService.updateFile).toHaveBeenCalled();
        });
      });

      describe('when file was never read', () => {
        beforeEach(() => {
          jest
            .mocked(mockFileAccessService.getText)
            .mockResolvedValue(`file with ${oldString} to edit`);
          jest
            .mocked(mockFileStateTracker.assertFileNotModifiedSinceLastRead)
            .mockImplementation(() => {
              throw new DuoFileNotReadError(filepath);
            });
        });

        it('should return error', async () => {
          const { error, response } = await editFileHandler.execute(action, workflowActionContext);

          expect(error).toBe(`You must read the file "${filepath}" before modifying it.`);
          expect(response).toBe('');
          expect(mockFileAccessService.updateFile).not.toHaveBeenCalled();
        });
      });

      describe('when file was modified since last read', () => {
        beforeEach(() => {
          jest
            .mocked(mockFileAccessService.getText)
            .mockResolvedValue(`file with ${oldString} to edit`);
          jest
            .mocked(mockFileStateTracker.assertFileNotModifiedSinceLastRead)
            .mockImplementation(() => {
              throw new DuoFileModifiedSinceLastReadError(filepath);
            });
        });

        it('should return error when file was modified since last read', async () => {
          const { error, response } = await editFileHandler.execute(action, workflowActionContext);

          expect(error).toBe(
            `File "${filepath}" has been modified since it was last read. You must read the file again before modifying it.`,
          );
          expect(response).toBe('');
          expect(mockFileAccessService.updateFile).not.toHaveBeenCalled();
        });
      });
    });
  });
});
