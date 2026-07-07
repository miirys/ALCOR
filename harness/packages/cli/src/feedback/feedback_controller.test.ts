import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { CLI_INPUT_TYPES, defaultAppState, defaultInputState } from '@gitlab-org/tui';
import { ok } from 'neverthrow';
import type { AppState } from '@gitlab-org/tui';
import type { Logger } from '@gitlab-org/logging';
import type { GitLabApiService } from '@gitlab-org/core';
import type { SecretRedactor } from '@gitlab-org/secret-redaction';
import type { WorkflowUrlOpenerService } from '@gitlab-org/ai-configuration';
import type { ControllerApi } from '../commands/tui/controller_api';
import type { CredentialProvider, Credentials } from '../utils/credential_provider';
import type { RuntimeContext } from '../runtime_context';
import type { LogPreviewController } from './log_preview_controller';
import type { FeedbackController } from './feedback_controller';

// Create mock function before jest.unstable_mockModule
const mockGetLogFilesWithStats = jest.fn();

// Mock the log file utilities using unstable_mockModule for ESM
// Must provide all exports to satisfy any imports
jest.unstable_mockModule('../commands/log/last_log', () => ({
  getLogFilesWithStats: mockGetLogFilesWithStats,
  openLastLogFile: jest.fn(),
  listLogFiles: jest.fn(),
  tailLastLogFile: jest.fn(),
  clearLogFiles: jest.fn(),
  pruneOldLogFiles: jest.fn(),
}));

// Use dynamic import for the module under test after mocking
const { DefaultFeedbackController } = await import('./feedback_controller');

// Get the fixture path
const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const fixtureLogPath = path.join(currentDir, '..', '..', 'test', 'fixtures', 'test.log');

describe('DefaultFeedbackController', () => {
  let controller: FeedbackController;
  let mockApi: ControllerApi;
  let mockState: AppState;
  let mockCredentialProvider: CredentialProvider;
  let mockRuntimeContext: RuntimeContext;
  let mockLogger: Logger;
  let mockApiService: GitLabApiService;
  let mockSecretRedactor: SecretRedactor;
  let mockUrlOpener: WorkflowUrlOpenerService;
  let mockLogPreviewController: LogPreviewController;

  const mockCredentials: Credentials = {
    token: 'test-token',
    baseUrl: 'https://gitlab.com',
    source: { type: 'env-or-flag' },
  };

  beforeEach(async () => {
    mockState = { ...defaultAppState };

    mockCredentialProvider = createFakePartial<CredentialProvider>({
      getCredentials: jest
        .fn<CredentialProvider['getCredentials']>()
        .mockResolvedValue(mockCredentials),
    });

    mockRuntimeContext = createFakePartial<RuntimeContext>({
      cliVersion: '1.0.0',
      envInfo: { osPlatform: 'darwin' },
    });

    mockLogger = createFakePartial<Logger>({
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    });

    mockApiService = createFakePartial<GitLabApiService>({
      fetchFromApi: jest.fn() as unknown as GitLabApiService['fetchFromApi'],
    });

    jest.mocked(mockApiService.fetchFromApi).mockResolvedValue({
      iid: 123,
      web_url: 'https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/123',
    });

    mockSecretRedactor = createFakePartial<SecretRedactor>({
      redactSecrets: jest.fn<SecretRedactor['redactSecrets']>((text: string) => text),
    });

    mockUrlOpener = createFakePartial<WorkflowUrlOpenerService>({
      openUrl: jest.fn<WorkflowUrlOpenerService['openUrl']>().mockResolvedValue(undefined),
    });

    mockLogPreviewController = createFakePartial<LogPreviewController>({
      openLogPreview: jest
        .fn<LogPreviewController['openLogPreview']>()
        .mockResolvedValue(undefined),
      closeLogPreview: jest.fn<LogPreviewController['closeLogPreview']>(),
      getCallbacks: jest.fn<LogPreviewController['getCallbacks']>().mockReturnValue({
        onCloseLogPreview: jest.fn(),
      }),
    });

    mockApi = createFakePartial<ControllerApi>({
      mutateState: jest.fn<ControllerApi['mutateState']>().mockImplementation((mutation) => {
        mockState = mutation(mockState);
        return mockState;
      }),
      showError: jest.fn(),
      showInfo: jest.fn(),
    });

    // Mock log file retrieval to point to fixture file
    // eslint-disable-next-line no-restricted-syntax
    mockGetLogFilesWithStats.mockClear();
    mockGetLogFilesWithStats.mockReturnValue(
      ok([
        {
          path: fixtureLogPath,
          mtime: new Date('2026-03-23T00:00:00.000Z'),
        },
      ]),
    );

    controller = new DefaultFeedbackController(
      mockCredentialProvider,
      mockRuntimeContext,
      mockLogger,
      mockSecretRedactor,
      mockUrlOpener,
      mockLogPreviewController,
      mockApiService,
    );
  });

  describe('openFeedback', () => {
    describe('when called with gitlab.com credentials', () => {
      beforeEach(async () => {
        jest.mocked(mockCredentialProvider.getCredentials).mockResolvedValue({
          token: 'test-token',
          baseUrl: 'https://gitlab.com',
          source: { type: 'env-or-flag' },
        });
        await controller.openFeedback(mockApi);
      });

      it('mutates state to show feedback input with type-selection step', () => {
        expect(mockApi.mutateState).toHaveBeenCalled();
        expect(mockState.input.inputType).toBe(CLI_INPUT_TYPES.FEEDBACK);
        expect(mockState.input).toMatchObject({
          inputType: CLI_INPUT_TYPES.FEEDBACK,
          step: 'type-selection',
        });
      });

      it('sets isGitLabDotCom to true', () => {
        expect(mockState.input).toMatchObject({
          isGitLabDotCom: true,
        });
      });

      describe('when bug type is selected', () => {
        beforeEach(() => {
          controller.selectType('bug', mockApi);
        });

        it('updates state with selected type and moves to description step', () => {
          expect(mockState.input).toMatchObject({
            inputType: CLI_INPUT_TYPES.FEEDBACK,
            step: 'description',
            selectedType: 'bug',
            includeLogs: true,
          });
        });

        describe('when description is submitted', () => {
          const description = 'Bug description';

          beforeEach(() => {
            controller.submitDescription(description, mockApi);
          });

          it('transitions to title step', () => {
            expect(mockState.input).toMatchObject({
              inputType: CLI_INPUT_TYPES.FEEDBACK,
              step: 'title',
            });
          });

          describe('when canceling title', () => {
            beforeEach(() => {
              controller.cancelTitle(mockApi);
            });

            it('returns to description step', () => {
              expect(mockState.input).toMatchObject({
                inputType: CLI_INPUT_TYPES.FEEDBACK,
                step: 'description',
              });
            });
          });

          describe('when title is submitted', () => {
            const title = 'My custom title';

            beforeEach(async () => {
              await controller.submitTitle(title, mockApi);
            });

            it('transitions to log-confirmation step', () => {
              expect(mockState.input).toMatchObject({
                inputType: CLI_INPUT_TYPES.FEEDBACK,
                step: 'log-confirmation',
              });
            });

            it('does not call GitLab API yet', () => {
              expect(mockApiService.fetchFromApi).not.toHaveBeenCalled();
            });

            describe('when canceling log confirmation', () => {
              beforeEach(() => {
                controller.cancelLogConfirmation(mockApi);
              });

              it('returns to title step', () => {
                expect(mockState.input).toMatchObject({
                  inputType: CLI_INPUT_TYPES.FEEDBACK,
                  step: 'title',
                });
              });

              it('does not submit to API', () => {
                expect(mockApiService.fetchFromApi).not.toHaveBeenCalled();
              });
            });

            describe('when confirming to include logs', () => {
              beforeEach(async () => {
                controller.confirmLogInclusion(true, mockApi);
                await new Promise((resolve) => {
                  setTimeout(resolve, 0);
                });
              });

              it('calls GitLab API with correct path and title', () => {
                expect(mockApiService.fetchFromApi).toHaveBeenCalledWith(
                  expect.objectContaining({
                    type: 'rest',
                    method: 'POST',
                    path: '/api/v4/projects/46519181/issues',
                    body: expect.objectContaining({
                      title: `[LS][CLI][Feedback] ${title}`,
                    }),
                  }),
                );
              });

              it('includes logs in the description', () => {
                const call = jest.mocked(mockApiService.fetchFromApi).mock.calls[0];
                const { body } = call[0] as { body: { description: string } };
                expect(body.description).toContain('<details>');
                expect(body.description).toContain('Recent CLI Logs');
              });

              it('marks issue as confidential when logs are included', () => {
                const call = jest.mocked(mockApiService.fetchFromApi).mock.calls[0];
                const { body } = call[0] as { body: { confidential: boolean } };
                expect(body.confidential).toBe(true);
              });

              it('moves to success state', () => {
                expect(mockState.input).toMatchObject({
                  inputType: CLI_INPUT_TYPES.FEEDBACK,
                  step: 'success',
                  issueNumber: 123,
                });
              });
            });

            describe('when confirming to skip logs', () => {
              beforeEach(async () => {
                controller.confirmLogInclusion(false, mockApi);
                await new Promise((resolve) => {
                  setTimeout(resolve, 0);
                });
              });

              it('calls GitLab API without logs', () => {
                const call = jest.mocked(mockApiService.fetchFromApi).mock.calls[0];
                const { body } = call[0] as { body: { description: string } };
                expect(body.description).not.toContain('<details>');
              });

              it('does not mark issue as confidential when logs are not included', () => {
                const call = jest.mocked(mockApiService.fetchFromApi).mock.calls[0];
                const { body } = call[0] as { body: { confidential: boolean } };
                expect(body.confidential).toBe(false);
              });

              it('moves to success state', () => {
                expect(mockState.input).toMatchObject({
                  inputType: CLI_INPUT_TYPES.FEEDBACK,
                  step: 'success',
                });
              });
            });
          });

          describe('when empty title is submitted', () => {
            beforeEach(async () => {
              await controller.submitTitle('', mockApi);
              controller.confirmLogInclusion(false, mockApi);
              await new Promise((resolve) => {
                setTimeout(resolve, 0);
              });
            });

            it('generates title from first line of description', () => {
              const call = jest.mocked(mockApiService.fetchFromApi).mock.calls[0];
              const { body } = call[0] as { body: { title: string } };
              expect(body.title).toBe('[LS][CLI][Feedback] Bug description');
            });
          });
        });
      });

      describe('when feature type is selected', () => {
        beforeEach(() => {
          controller.selectType('feature', mockApi);
        });

        it('updates state with selected type and moves to description step', () => {
          expect(mockState.input).toMatchObject({
            inputType: CLI_INPUT_TYPES.FEEDBACK,
            step: 'description',
            selectedType: 'feature',
            includeLogs: false,
          });
        });

        describe('when description and title are submitted', () => {
          const description = 'Feature description';
          const title = 'My feature title';

          beforeEach(async () => {
            controller.submitDescription(description, mockApi);
            await controller.submitTitle(title, mockApi);
            await new Promise((resolve) => {
              setTimeout(resolve, 0);
            });
          });

          it('calls GitLab API with correct path and title', () => {
            expect(mockApiService.fetchFromApi).toHaveBeenCalledWith(
              expect.objectContaining({
                type: 'rest',
                method: 'POST',
                path: '/api/v4/projects/46519181/issues',
                body: expect.objectContaining({
                  title: `[LS][CLI][Feedback] ${title}`,
                }),
              }),
            );
          });

          it('does not mark feature requests as confidential', () => {
            const call = jest.mocked(mockApiService.fetchFromApi).mock.calls[0];
            const { body } = call[0] as { body: { confidential: boolean } };
            expect(body.confidential).toBe(false);
          });

          it('includes duo-cli, type::feature, feedback-form, and required labels', () => {
            const call = jest.mocked(mockApiService.fetchFromApi).mock.calls[0];
            const { body } = call[0] as { body: { labels: string } };
            expect(body.labels).toBe(
              'duo-cli,type::feature,feedback-form,Editor Extensions::Duo CLI,group::editor extensions',
            );
          });

          it('does not include logs', () => {
            const call = jest.mocked(mockApiService.fetchFromApi).mock.calls[0];
            const { body } = call[0] as { body: { description: string } };
            expect(body.description).not.toContain('<details>');
          });

          it('uses custom title with prefix', () => {
            const call = jest.mocked(mockApiService.fetchFromApi).mock.calls[0];
            const { body } = call[0] as { body: { title: string } };
            expect(body.title).toBe(`[LS][CLI][Feedback] ${title}`);
          });

          it('sets submissionMethod to api', () => {
            expect(mockState.input).toMatchObject({
              inputType: CLI_INPUT_TYPES.FEEDBACK,
              step: 'success',
              submissionMethod: 'api',
            });
          });
        });

        describe('when empty title is submitted', () => {
          const description = 'Feature description\nMore details';

          beforeEach(async () => {
            controller.submitDescription(description, mockApi);
            await controller.submitTitle('', mockApi);
            await new Promise((resolve) => {
              setTimeout(resolve, 0);
            });
          });

          it('generates title from first line of description', () => {
            expect(mockApiService.fetchFromApi).toHaveBeenCalledWith(
              expect.objectContaining({
                type: 'rest',
                method: 'POST',
                path: '/api/v4/projects/46519181/issues',
                body: expect.objectContaining({
                  title: '[LS][CLI][Feedback] Feature description',
                }),
              }),
            );
          });
        });
      });
    });

    describe('when called with self-managed credentials', () => {
      beforeEach(async () => {
        jest.mocked(mockCredentialProvider.getCredentials).mockResolvedValue({
          token: 'test-token',
          baseUrl: 'https://gitlab.example.com',
          source: { type: 'env-or-flag' },
        });
        await controller.openFeedback(mockApi);
      });

      it('sets isGitLabDotCom to false', () => {
        expect(mockState.input).toMatchObject({
          isGitLabDotCom: false,
        });
      });

      describe('when submitting a bug report', () => {
        const description = 'Bug on self-managed instance';
        const title = 'Self-managed bug';

        beforeEach(async () => {
          controller.selectType('bug', mockApi);
          controller.submitDescription(description, mockApi);
          await controller.submitTitle(title, mockApi);
          await new Promise((resolve) => {
            setTimeout(resolve, 0);
          });
        });

        it('skips log-confirmation step and submits immediately', () => {
          if (mockState.input.inputType === CLI_INPUT_TYPES.FEEDBACK) {
            expect(mockState.input.step).not.toBe('log-confirmation');
          }
        });

        it('opens prefilled URL in browser pointing to gitlab.com', () => {
          expect(mockUrlOpener.openUrl).toHaveBeenCalled();
          const calledUrl = jest.mocked(mockUrlOpener.openUrl).mock.calls[0][0];
          expect(calledUrl).toContain('https://gitlab.com');
          expect(calledUrl).toContain('gitlab-org/editor-extensions/gitlab-lsp');
          expect(calledUrl).toContain('issues/new');
          expect(calledUrl).toContain('%5BLS%5D%5BCLI%5D%5BFeedback%5D+Self-managed+bug');
        });

        it('includes structured template for bug reports', () => {
          const calledUrl = jest.mocked(mockUrlOpener.openUrl).mock.calls[0][0];
          expect(calledUrl).toContain('Bug+on+self-managed+instance');
          expect(calledUrl).toContain('**System+Information**');
          expect(calledUrl).toContain('**Relevant+logs');
          expect(calledUrl).toContain('%28optional%29');
        });

        it('includes labels as quick actions in description', () => {
          const calledUrl = jest.mocked(mockUrlOpener.openUrl).mock.calls[0][0];
          expect(calledUrl).toContain(
            '%2Flabel+%7E%22duo-cli%22+%7E%22type%3A%3Abug%22+%7E%22feedback-form%22+%7E%22Editor+Extensions%3A%3ADuo+CLI%22+%7E%22group%3A%3Aeditor+extensions%22',
          );
        });

        it('includes duo log list command hint', () => {
          const calledUrl = jest.mocked(mockUrlOpener.openUrl).mock.calls[0][0];
          expect(calledUrl).toContain('duo+log+list');
        });

        it('does not call GitLab API', () => {
          expect(mockApiService.fetchFromApi).not.toHaveBeenCalled();
        });

        it('moves to success state with url submission method', () => {
          expect(mockState.input).toMatchObject({
            inputType: CLI_INPUT_TYPES.FEEDBACK,
            step: 'success',
            submissionMethod: 'url',
          });
        });

        it('does not set issueNumber', () => {
          expect(mockState.input).toMatchObject({
            inputType: CLI_INPUT_TYPES.FEEDBACK,
          });
          if (mockState.input.inputType === CLI_INPUT_TYPES.FEEDBACK) {
            expect(mockState.input.issueNumber).toBeUndefined();
          }
        });

        it('uses URL submission method', () => {
          expect(mockState.input).toMatchObject({
            inputType: CLI_INPUT_TYPES.FEEDBACK,
            submissionMethod: 'url',
          });
        });
      });

      describe('when submitting a feature request', () => {
        const description = 'Feature on self-managed instance';
        const title = 'Self-managed feature';

        beforeEach(async () => {
          controller.selectType('feature', mockApi);
          controller.submitDescription(description, mockApi);
          await controller.submitTitle(title, mockApi);
          await new Promise((resolve) => {
            setTimeout(resolve, 0);
          });
        });

        it('opens prefilled URL in browser pointing to gitlab.com', () => {
          expect(mockUrlOpener.openUrl).toHaveBeenCalled();
          const calledUrl = jest.mocked(mockUrlOpener.openUrl).mock.calls[0][0];
          expect(calledUrl).toContain('https://gitlab.com');
        });

        it('includes bold formatting for feature requests', () => {
          const calledUrl = jest.mocked(mockUrlOpener.openUrl).mock.calls[0][0];
          expect(calledUrl).toContain('**Summary**');
        });

        it('does not include system information for feature requests', () => {
          const calledUrl = jest.mocked(mockUrlOpener.openUrl).mock.calls[0][0];
          expect(calledUrl).not.toContain('**System+Information**');
          expect(calledUrl).not.toContain('CLI+Version');
        });

        it('includes feature labels as quick actions in description', () => {
          const calledUrl = jest.mocked(mockUrlOpener.openUrl).mock.calls[0][0];
          expect(calledUrl).toContain(
            '%2Flabel+%7E%22duo-cli%22+%7E%22type%3A%3Afeature%22+%7E%22feedback-form%22+%7E%22Editor+Extensions%3A%3ADuo+CLI%22+%7E%22group%3A%3Aeditor+extensions%22',
          );
        });

        it('does not include logs section for feature requests', () => {
          const calledUrl = jest.mocked(mockUrlOpener.openUrl).mock.calls[0][0];
          expect(calledUrl).not.toContain('Relevant+logs');
          expect(calledUrl).not.toContain('duo+log+list');
        });

        it('moves to success state with url submission method', () => {
          expect(mockState.input).toMatchObject({
            inputType: CLI_INPUT_TYPES.FEEDBACK,
            step: 'success',
            submissionMethod: 'url',
          });
        });
      });
    });

    describe('when called with no token', () => {
      beforeEach(async () => {
        jest.mocked(mockCredentialProvider.getCredentials).mockResolvedValue({
          token: '',
          baseUrl: 'https://gitlab.com',
          source: { type: 'env-or-flag' },
        });
        await controller.openFeedback(mockApi);
      });

      it('sets isGitLabDotCom to false', () => {
        expect(mockState.input).toMatchObject({
          isGitLabDotCom: false,
        });
      });

      describe('when submitting feedback', () => {
        beforeEach(async () => {
          controller.selectType('feature', mockApi);
          controller.submitDescription('Test description', mockApi);
          await controller.submitTitle('Test title', mockApi);
          await new Promise((resolve) => {
            setTimeout(resolve, 0);
          });
        });

        it('falls back to URL submission', () => {
          expect(mockUrlOpener.openUrl).toHaveBeenCalled();
          expect(mockApiService.fetchFromApi).not.toHaveBeenCalled();
        });

        it('moves to success state with url submission method', () => {
          expect(mockState.input).toMatchObject({
            inputType: CLI_INPUT_TYPES.FEEDBACK,
            submissionMethod: 'url',
          });
        });
      });
    });

    describe('when credential fetch fails', () => {
      beforeEach(async () => {
        jest.mocked(mockCredentialProvider.getCredentials).mockRejectedValue(new Error('Failed'));
        await controller.openFeedback(mockApi);
      });

      it('sets isGitLabDotCom to false by default', () => {
        expect(mockState.input).toMatchObject({
          isGitLabDotCom: false,
        });
      });

      it('logs a warning', () => {
        expect(mockLogger.warn).toHaveBeenCalledWith(
          '[FeedbackController] Failed to fetch credentials during feedback initialization',
          expect.any(Error),
        );
      });
    });
  });

  describe('error handling', () => {
    describe('when API call fails', () => {
      beforeEach(async () => {
        jest.mocked(mockApiService.fetchFromApi).mockRejectedValue(new Error('401 Unauthorized'));

        await controller.openFeedback(mockApi);
        controller.selectType('bug', mockApi);
        controller.submitDescription('Test description', mockApi);
        await controller.submitTitle('Test title', mockApi);
        controller.confirmLogInclusion(false, mockApi);
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });

      it('shows error message', () => {
        expect(mockApi.showError).toHaveBeenCalledWith(
          expect.stringContaining('Failed to submit feedback'),
        );
      });

      it('returns to description step', () => {
        expect(mockState.input).toMatchObject({
          inputType: CLI_INPUT_TYPES.FEEDBACK,
          step: 'description',
        });
      });
    });
  });

  describe('cancelFeedback', () => {
    beforeEach(async () => {
      await controller.openFeedback(mockApi);
      controller.cancelFeedback(mockApi);
    });

    it('returns to default input state', () => {
      expect(mockState.input).toEqual(defaultInputState);
    });
  });

  describe('closeFeedbackSuccess', () => {
    beforeEach(async () => {
      await controller.openFeedback(mockApi);
      controller.selectType('bug', mockApi);
      controller.closeFeedbackSuccess(mockApi);
    });

    it('returns to default input state', () => {
      expect(mockState.input).toEqual(defaultInputState);
    });
  });

  describe('getCallbacks', () => {
    it('returns callbacks that invoke controller methods', () => {
      const callbacks = controller.getCallbacks(mockApi);

      // Test that callbacks invoke controller methods
      callbacks.onSelectFeedbackType('bug');
      expect(mockApi.mutateState).toHaveBeenCalled();

      callbacks.onCancelFeedback();
      expect(mockState.input).toEqual(defaultInputState);
    });
  });

  describe('previewLogs', () => {
    describe('when logs are available', () => {
      const description = 'Bug description';
      const title = 'Bug title';

      beforeEach(async () => {
        await controller.openFeedback(mockApi);
        controller.selectType('bug', mockApi);
        controller.submitDescription(description, mockApi);
        await controller.submitTitle(title, mockApi);
        // Now at log-confirmation step
        await controller.previewLogs(mockApi);
      });

      it('delegates to LogPreviewController with content to avoid double read', () => {
        const expectedContent = `[2026-03-23T00:00:00.000Z] INFO: CLI started
[2026-03-23T00:00:01.000Z] DEBUG: Processing command
[2026-03-23T00:00:02.000Z] ERROR: Sample error for testing
[2026-03-23T00:00:03.000Z] INFO: Command completed
`;
        expect(mockLogPreviewController.openLogPreview).toHaveBeenCalledWith(
          mockApi,
          fixtureLogPath,
          expectedContent,
        );
      });

      it('fetches logs from most recent log file', () => {
        expect(mockGetLogFilesWithStats).toHaveBeenCalled();
      });
    });

    describe('when no logs are available', () => {
      const description = 'Bug description';
      const title = 'Bug title';

      beforeEach(async () => {
        // Mock no log files available
        mockGetLogFilesWithStats.mockReturnValue(ok([]));

        await controller.openFeedback(mockApi);
        controller.selectType('bug', mockApi);
        controller.submitDescription(description, mockApi);
        await controller.submitTitle(title, mockApi);
        await controller.previewLogs(mockApi);
      });

      it('does not open log preview', () => {
        expect(mockLogPreviewController.openLogPreview).not.toHaveBeenCalled();
      });
    });
  });
});
