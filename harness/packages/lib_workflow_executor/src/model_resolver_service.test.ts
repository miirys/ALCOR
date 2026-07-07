import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { FeatureFlagService, InstanceFeatureFlags } from '@gitlab-org/core';
import type { AiChatAvailableModelsData } from '@gitlab-org/graphql';
import { WorkflowRailsService } from './api/workflow_rails_service';
import { DefaultModelResolverService } from './model_resolver_service';

describe('DefaultModelResolverService', () => {
  let service: DefaultModelResolverService;
  let mockWorkflowRailsService: WorkflowRailsService;
  let mockFeatureFlagService: FeatureFlagService;
  const mockLogger = new TestLogger();

  const makeAvailableModels = (
    overrides: Partial<AiChatAvailableModelsData['aiChatAvailableModels']> = {},
  ): AiChatAvailableModelsData => ({
    aiChatAvailableModels: {
      defaultModel: { name: 'Default', ref: 'default-model-id' },
      pinnedModel: null,
      selectableModels: [
        { name: 'Default', ref: 'default-model-id' },
        { name: 'Alt', ref: 'alt-model-id' },
      ],
      ...overrides,
    },
    metadata: {
      featureFlags: [{ name: InstanceFeatureFlags.UserModelSwitching, enabled: true }],
      version: '18.5.0-ee',
    },
  });

  beforeEach(() => {
    mockWorkflowRailsService = createFakePartial<WorkflowRailsService>({
      getAiChatAvailableModels: jest.fn().mockResolvedValue(null),
    });
    mockFeatureFlagService = createFakePartial<FeatureFlagService>({
      isInstanceFlagEnabled: jest.fn().mockReturnValue(true),
    });

    service = new DefaultModelResolverService(
      mockWorkflowRailsService,
      mockFeatureFlagService,
      mockLogger,
    );
  });

  describe('API call', () => {
    it.each`
      description                    | input                      | expected
      ${'provided rootNamespaceId'}  | ${'gid://gitlab/Group/42'} | ${'gid://gitlab/Group/42'}
      ${'undefined rootNamespaceId'} | ${undefined}               | ${undefined}
    `('passes $description as rootNamespaceId', async ({ input, expected }) => {
      await service.resolveModel(undefined, input);

      expect(mockWorkflowRailsService.getAiChatAvailableModels).toHaveBeenCalledWith({
        rootNamespaceId: expected,
      });
    });
  });

  describe('when no models are available', () => {
    it('returns undefined when getAiChatAvailableModels returns null', async () => {
      const result = await service.resolveModel('alt-model-id');

      expect(result).toBeUndefined();
    });

    it('returns undefined when no default or selectable models exist', async () => {
      jest
        .mocked(mockWorkflowRailsService.getAiChatAvailableModels)
        .mockResolvedValue(makeAvailableModels({ defaultModel: null, selectableModels: [] }));

      const result = await service.resolveModel(undefined);

      expect(result).toBeUndefined();
    });
  });

  describe('pinned model', () => {
    beforeEach(() => {
      jest
        .mocked(mockWorkflowRailsService.getAiChatAvailableModels)
        .mockResolvedValue(
          makeAvailableModels({ pinnedModel: { name: 'Pinned', ref: 'pinned-id' } }),
        );
    });

    it.each`
      scenario                                      | requestedModel    | flagEnabled
      ${'no user selection'}                        | ${undefined}      | ${true}
      ${'user requested a different model'}         | ${'alt-model-id'} | ${true}
      ${'UserModelSwitching feature flag disabled'} | ${'alt-model-id'} | ${false}
    `('returns the pinned model when $scenario', async ({ requestedModel, flagEnabled }) => {
      jest.mocked(mockFeatureFlagService.isInstanceFlagEnabled).mockReturnValue(flagEnabled);

      expect(await service.resolveModel(requestedModel)).toBe('pinned-id');
    });
  });

  describe('UserModelSwitching feature flag disabled', () => {
    beforeEach(() => {
      jest.mocked(mockFeatureFlagService.isInstanceFlagEnabled).mockReturnValue(false);
      jest
        .mocked(mockWorkflowRailsService.getAiChatAvailableModels)
        .mockResolvedValue(makeAvailableModels());
    });

    it.each`
      description        | requestedModel
      ${'no model'}      | ${undefined}
      ${'a valid model'} | ${'alt-model-id'}
    `('returns undefined when requested model is $description', async ({ requestedModel }) => {
      expect(await service.resolveModel(requestedModel)).toBeUndefined();
    });

    it('checks the correct feature flag', async () => {
      await service.resolveModel(undefined);

      expect(mockFeatureFlagService.isInstanceFlagEnabled).toHaveBeenCalledWith(
        InstanceFeatureFlags.UserModelSwitching,
      );
    });
  });

  describe('user-selected model', () => {
    beforeEach(() => {
      jest
        .mocked(mockWorkflowRailsService.getAiChatAvailableModels)
        .mockResolvedValue(makeAvailableModels());
    });

    it.each`
      description                                  | requestedModel             | expected
      ${'returns the requested model'}             | ${'alt-model-id'}          | ${'alt-model-id'}
      ${'falls back to default for unknown model'} | ${'non-existent-model-id'} | ${'default-model-id'}
      ${'returns default when no model requested'} | ${undefined}               | ${'default-model-id'}
    `('$description', async ({ requestedModel, expected }) => {
      expect(await service.resolveModel(requestedModel)).toBe(expected);
    });
  });

  describe('logging when model cannot be resolved client-side', () => {
    beforeEach(() => {
      mockLogger.clear();
    });

    describe('non-chat flow (no selectable models, e.g. code review)', () => {
      beforeEach(() => {
        // No models available: this is the normal case for non-chat flows (e.g. code
        // review), where the model is resolved server-side from the feature setting.
        jest
          .mocked(mockWorkflowRailsService.getAiChatAvailableModels)
          .mockResolvedValue(makeAvailableModels({ defaultModel: null, selectableModels: [] }));
      });

      it('does not log about the requested model when there are no selectable models', async () => {
        await service.resolveModel('claude_sonnet_4_6');

        expect(mockLogger.warnLogs).toEqual([]);
        expect(mockLogger.debugLogs).not.toContainEqual(
          expect.objectContaining({
            message: expect.stringContaining('is not in the selectable set'),
          }),
        );
      });

      it('logs at debug, not info, when no model is resolved', async () => {
        await service.resolveModel(undefined);

        expect(mockLogger.infoLogs).toEqual([]);
        expect(mockLogger.debugLogs).toContainEqual(
          expect.objectContaining({
            message: expect.stringContaining('the server will apply the default model'),
          }),
        );
      });
    });

    describe('chat flow (selectable models present, requested model not among them)', () => {
      beforeEach(() => {
        jest
          .mocked(mockWorkflowRailsService.getAiChatAvailableModels)
          .mockResolvedValue(makeAvailableModels());
      });

      it('logs at debug (not warn) that the requested model is not selectable', async () => {
        await service.resolveModel('unknown-model-id');

        expect(mockLogger.warnLogs).toEqual([]);
        expect(mockLogger.debugLogs).toContainEqual(
          expect.objectContaining({
            message: expect.stringContaining(
              'Requested chat model "unknown-model-id" is not in the selectable set',
            ),
          }),
        );
      });
    });
  });
});
