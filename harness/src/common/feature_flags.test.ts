import {
  InstanceFeatureFlagsService,
  InstanceFeatureFlags,
  ClientFeatureFlags,
  FeatureFlagService,
} from '@gitlab-org/core';
import { createFakePartial } from '@gitlab-org/test-utils';
import { ConfigService, ClientConfig } from '@gitlab-org/config';
import { DefaultFeatureFlagService } from './feature_flags';

describe('DefaultFeatureFlagService', () => {
  let featureFlagService: FeatureFlagService;
  let configService: ConfigService;
  let instanceFeatureFlagService: InstanceFeatureFlagsService;

  beforeEach(() => {
    instanceFeatureFlagService = createFakePartial<InstanceFeatureFlagsService>({
      isInstanceFlagEnabled: jest.fn(),
      updateInstanceFeatureFlags: jest.fn(),
    });
    configService = createFakePartial<ConfigService>({ get: jest.fn() });
    featureFlagService = new DefaultFeatureFlagService(configService, instanceFeatureFlagService);
  });

  describe('updateInstanceFeatureFlags', () => {
    it('delegates to InstanceFeatureFlagService', async () => {
      await featureFlagService.updateInstanceFeatureFlags();

      expect(instanceFeatureFlagService.updateInstanceFeatureFlags).toHaveBeenCalled();
    });
  });

  describe('isInstanceFlagEnabled', () => {
    it('should get override from config if available', () => {
      const mockConfig = createFakePartial<ClientConfig['featureFlags']>({
        [InstanceFeatureFlags.EditorAdvancedContext]: true,
      });

      jest.mocked(configService.get).mockImplementation((key: string) => {
        return key === 'featureFlagOverrides' ? (mockConfig as unknown as undefined) : undefined;
      });

      const result = featureFlagService.isInstanceFlagEnabled(
        InstanceFeatureFlags.EditorAdvancedContext,
      );

      expect(result).toBe(true);
      expect(configService.get).toHaveBeenCalledWith('featureFlagOverrides');
    });

    it('delegates to InstanceFeatureFlagService when no overrides', async () => {
      jest.mocked(configService.get).mockReset();
      const result = true;
      jest.mocked(instanceFeatureFlagService.isInstanceFlagEnabled).mockReturnValue(result);
      expect(
        featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.EditorAdvancedContext),
      ).toBe(result);

      expect(instanceFeatureFlagService.isInstanceFlagEnabled).toHaveBeenCalled();
    });
  });

  describe('isClientFlagEnabled', () => {
    it('hould get override from config if available', () => {
      const mockConfig = createFakePartial<ClientConfig['featureFlags']>({
        [ClientFeatureFlags.StreamCodeGenerations]: true,
      });

      jest.mocked(configService.get).mockImplementation((key: string) => {
        return key === 'featureFlagOverrides' ? (mockConfig as unknown as undefined) : undefined;
      });

      const result = featureFlagService.isClientFlagEnabled(
        ClientFeatureFlags.StreamCodeGenerations,
      );

      expect(result).toBe(true);
      expect(configService.get).toHaveBeenCalledWith('featureFlagOverrides');
      expect(configService.get).not.toHaveBeenCalledWith('featureFlags');
    });

    it('should return the client flag if available', () => {
      const mockConfig = createFakePartial<ClientConfig['featureFlags']>({
        [ClientFeatureFlags.StreamCodeGenerations]: true,
      });
      const mockGet = jest.mocked(configService.get).mockImplementation((key: string) => {
        return key === 'featureFlags' ? (mockConfig as unknown as undefined) : undefined;
      });

      const result = featureFlagService.isClientFlagEnabled(
        ClientFeatureFlags.StreamCodeGenerations,
      );

      expect(result).toBe(true);
      expect(mockGet).toHaveBeenCalledTimes(2);
      expect(mockGet).toHaveBeenNthCalledWith(1, 'featureFlagOverrides');
      expect(mockGet).toHaveBeenNthCalledWith(2, 'featureFlags');
    });

    it('should return false if the client flag is not available', () => {
      const mockGet = jest.mocked(configService.get);
      mockGet.mockReturnValue({} as unknown as undefined);

      const result = featureFlagService.isClientFlagEnabled(
        ClientFeatureFlags.StreamCodeGenerations,
      );

      expect(result).toBe(false);
      expect(mockGet).toHaveBeenCalledTimes(2);
      expect(mockGet).toHaveBeenNthCalledWith(1, 'featureFlagOverrides');
      expect(mockGet).toHaveBeenNthCalledWith(2, 'featureFlags');
    });
  });
});
