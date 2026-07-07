import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { WorkflowRunner } from '@gitlab-lsp/workflow-api';
import { WorkflowRailsService } from '@gitlab-org/workflow-executor';
import { ConfigService } from '@gitlab-org/config';
import { UserPersistentStorage } from '@gitlab-org/persistent-storage';
import { GitLabModelManager } from './gitlab_model_manager';
import type { GitLabParsedOptions } from './gitlab_parsed_options';

describe('GitLabModelManager', () => {
  let mockLogger: TestLogger;
  let mockWorkflowRailsService: WorkflowRailsService;
  let mockWorkflowRunner: WorkflowRunner;
  let mockConfigService: ConfigService;
  let mockUserPersistentStorage: UserPersistentStorage;

  beforeEach(() => {
    mockLogger = new TestLogger();
    mockWorkflowRailsService = createFakePartial<WorkflowRailsService>({
      getAiChatAvailableModels: jest.fn<WorkflowRailsService['getAiChatAvailableModels']>(() =>
        Promise.resolve(null),
      ),
    });
    mockWorkflowRunner = createFakePartial<WorkflowRunner>({
      resolveModel: jest.fn<WorkflowRunner['resolveModel']>(() => Promise.resolve(undefined)),
    });
    mockConfigService = createFakePartial<ConfigService>({
      get: jest.fn().mockReturnValue('') as ConfigService['get'],
    });
    mockUserPersistentStorage = createFakePartial<UserPersistentStorage>({});
  });

  const createManager = (duoWorkflowMetadata?: Record<string, unknown>): GitLabModelManager => {
    const opts = createFakePartial<GitLabParsedOptions>({ duoWorkflowMetadata });
    return new GitLabModelManager(
      opts,
      mockUserPersistentStorage,
      mockWorkflowRailsService,
      mockWorkflowRunner,
      mockConfigService,
      mockLogger,
    );
  };

  const modelForRunLogs = (): string[] =>
    mockLogger.infoLogs
      .map((entry) => entry.message)
      .filter((message): message is string => message?.includes('Model for this run') ?? false);

  describe('logging the model used for the run', () => {
    it('logs the concrete model when the server pins an identifier', async () => {
      const manager = createManager({
        modelMetadata: JSON.stringify({
          provider: 'gitlab',
          feature_setting: 'review_merge_request_dap',
          identifier: 'claude-sonnet-4-5-20250929',
        }),
      });

      await manager.resolveModel();

      expect(modelForRunLogs()).toHaveLength(1);
      expect(modelForRunLogs()[0]).toContain(
        'Model for this run: "claude-sonnet-4-5-20250929" (provider: gitlab, feature: review_merge_request_dap)',
      );
    });

    it('states the GitLab default is used when no identifier is provided', async () => {
      const manager = createManager({
        modelMetadata: JSON.stringify({
          provider: 'gitlab',
          feature_setting: 'review_merge_request_dap',
          identifier: null,
        }),
      });

      await manager.resolveModel();

      expect(modelForRunLogs()).toHaveLength(1);
      expect(modelForRunLogs()[0]).toContain(
        'Model for this run: GitLab default for feature "review_merge_request_dap" (provider: gitlab, feature: review_merge_request_dap)',
      );
    });

    it('treats an empty identifier as the GitLab default (server coerces "" to the default)', async () => {
      const manager = createManager({
        modelMetadata: JSON.stringify({
          provider: 'gitlab',
          feature_setting: 'review_merge_request_dap',
          identifier: '',
        }),
      });

      await manager.resolveModel();

      expect(modelForRunLogs()).toHaveLength(1);
      expect(modelForRunLogs()[0]).toContain(
        'Model for this run: GitLab default for feature "review_merge_request_dap"',
      );
    });

    it.each`
      scenario       | duoWorkflowMetadata
      ${'absent'}    | ${undefined}
      ${'malformed'} | ${{ modelMetadata: 'not-json' }}
    `(
      'does not throw or log a model line when metadata is $scenario',
      async ({ duoWorkflowMetadata }: { duoWorkflowMetadata?: Record<string, unknown> }) => {
        const manager = createManager(duoWorkflowMetadata);

        await expect(manager.resolveModel()).resolves.toBeUndefined();
        expect(modelForRunLogs()).toEqual([]);
      },
    );
  });
});
