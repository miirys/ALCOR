import type { Logger } from '@gitlab-org/logging';
import { createMockLogger } from '@gitlab-org/webview/test_utils';
import { createFakePartial } from '@gitlab-org/test-utils';
import { ClientError } from 'graphql-request';
import { GraphQLError } from 'graphql/error';
import {
  ApiReconfiguredData,
  GitLabApiService,
  GitLabVersionResponse,
  versionRequest,
} from '../gitlab_api';
import {
  DefaultInstanceFeatureFlagsService,
  getInstanceFeatureFlagsRequest,
  InstanceFeatureFlagsResponseType,
  queryGetInstanceFlagLegacy,
} from './instance_feature_flags';
import {
  InstanceFeatureFlags,
  InstanceFeatureFlagIntroduced,
  InstanceFeatureFlagRollout,
} from './constants';

jest.useFakeTimers();

describe('DefaultInstanceFeatureFlagsService', () => {
  let api: GitLabApiService;
  let featureFlagService: DefaultInstanceFeatureFlagsService;
  let mockLogger: Logger;

  const setupFetchHandlers = (
    versionResponse: GitLabVersionResponse,
    featureFlagsResponse: InstanceFeatureFlagsResponseType,
  ) => {
    const mockFetchFromApi = jest.mocked(api.fetchFromApi);
    mockFetchFromApi.mockImplementation((request) => {
      if (request === versionRequest) {
        return Promise.resolve(versionResponse);
      }
      if (request.type === 'graphql' && request.variables?.names) {
        return Promise.resolve(featureFlagsResponse);
      }
      return Promise.reject(new Error('Unexpected request'));
    });
  };

  const setupLegacyFetchHandlers = (
    versionResponse: GitLabVersionResponse,
    featureFlagResponses: Record<string, boolean>,
  ) => {
    const mockFetchFromApi = jest.mocked(api.fetchFromApi);
    mockFetchFromApi.mockImplementation((request) => {
      if (request === versionRequest) {
        return Promise.resolve(versionResponse);
      }
      if (
        request.type === 'graphql' &&
        request.query === queryGetInstanceFlagLegacy &&
        request.variables?.name
      ) {
        const flagName = request.variables.name as string;
        if (flagName in featureFlagResponses) {
          return Promise.resolve({ featureFlagEnabled: featureFlagResponses[flagName] });
        }
        // Simulate a GraphQL error for non-existent flags
        const error = new ClientError(
          {
            errors: [
              createFakePartial<GraphQLError>({
                message: `Field 'featureFlagEnabled' doesn't exist on type 'Query'`,
              }),
            ],
            status: 200,
            headers: {},
            data: null,
          },
          { query: request.query, variables: request.variables },
        );
        return Promise.reject(error);
      }
      return Promise.reject(new Error('Unexpected request'));
    });
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    api = createFakePartial<GitLabApiService>({
      fetchFromApi: jest.fn(),
      onApiReconfigured: jest.fn(),
    });
    featureFlagService = new DefaultInstanceFeatureFlagsService(mockLogger, api);
  });

  it('should include introduced versions for all instance flags', () => {
    expect(Object.values(InstanceFeatureFlags)).toEqual(
      expect.arrayContaining(Object.keys(InstanceFeatureFlagIntroduced)),
    );
  });

  it('should include feature flags for instance flags being rolled out across instance versions', () => {
    Object.keys(InstanceFeatureFlagRollout).forEach((flag) =>
      expect(Object.values(InstanceFeatureFlags)).toContain(flag),
    );
  });

  describe('updateInstanceFeatureFlags', () => {
    describe('with GitLab 17.4.0 and later (batch query)', () => {
      describe('with instance flags set', () => {
        beforeEach(() => {
          setupFetchHandlers(
            { version: '17.4.0' },
            {
              metadata: {
                featureFlags: Object.values(InstanceFeatureFlags).map((name) => ({
                  name,
                  enabled: true,
                })),
              },
            },
          );
        });

        it('should populate the feature flags cache', async () => {
          await featureFlagService.updateInstanceFeatureFlags();

          expect(api.fetchFromApi).toHaveBeenCalledWith(versionRequest);
          expect(api.fetchFromApi).toHaveBeenCalledWith(
            getInstanceFeatureFlagsRequest(Object.values(InstanceFeatureFlags)),
          );
        });

        it('should set all flags to enabled when returned from API', async () => {
          await featureFlagService.updateInstanceFeatureFlags();

          Object.values(InstanceFeatureFlags).forEach((flag) => {
            expect(featureFlagService.isInstanceFlagEnabled(flag)).toBe(true);
          });
        });
      });

      describe('with instance flags response empty', () => {
        beforeEach(() => {
          setupFetchHandlers(
            { version: '17.4.0' },
            {
              metadata: {
                featureFlags: [],
              },
            },
          );
        });

        it('should use default rollout values for missing flags', async () => {
          await featureFlagService.updateInstanceFeatureFlags();

          // Flags with rollout versions should be enabled if version >= rollout version
          expect(
            featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.EditorAdvancedContext),
          ).toBe(true);
          expect(
            featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.CodeSuggestionsContext),
          ).toBe(true);

          // Flags without rollout versions should be disabled
          expect(featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.DuoWorkflow)).toBe(
            false,
          );
        });
      });
    });

    describe('with GitLab < 17.4.0 (legacy individual queries)', () => {
      describe('with instance flags set', () => {
        beforeEach(() => {
          setupLegacyFetchHandlers(
            { version: '17.3.0' },
            Object.fromEntries(Object.values(InstanceFeatureFlags).map((flag) => [flag, true])),
          );
        });

        it('should query each flag individually', async () => {
          await featureFlagService.updateInstanceFeatureFlags();

          expect(api.fetchFromApi).toHaveBeenCalledWith(versionRequest);

          // Should make individual queries for each flag
          Object.values(InstanceFeatureFlags).forEach((flag) => {
            expect(api.fetchFromApi).toHaveBeenCalledWith({
              type: 'graphql',
              query: queryGetInstanceFlagLegacy,
              variables: { name: flag },
            });
          });
        });

        it('should set all flags to enabled when returned from API', async () => {
          await featureFlagService.updateInstanceFeatureFlags();

          Object.values(InstanceFeatureFlags).forEach((flag) => {
            expect(featureFlagService.isInstanceFlagEnabled(flag)).toBe(true);
          });
        });
      });

      describe('with some flags not existing on instance', () => {
        beforeEach(() => {
          setupLegacyFetchHandlers(
            { version: '17.3.0' },
            {
              [InstanceFeatureFlags.EditorAdvancedContext]: true,
              [InstanceFeatureFlags.CodeSuggestionsContext]: false,
              // DuoWorkflow will throw errors (not exist)
            },
          );
        });

        it('should handle missing flags with default rollout logic', async () => {
          await featureFlagService.updateInstanceFeatureFlags();

          // Flags that exist and are enabled
          expect(
            featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.EditorAdvancedContext),
          ).toBe(true);

          // Flags that exist and are disabled
          expect(
            featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.CodeSuggestionsContext),
          ).toBe(false);

          // Flags that don't exist should use default logic
          expect(featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.DuoWorkflow)).toBe(
            false,
          );
        });

        it('should log debug messages for non-existent flags', async () => {
          await featureFlagService.updateInstanceFeatureFlags();

          expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.stringContaining(`query doesn't exist`),
            expect.any(String),
          );
        });
      });

      describe('with version-specific rollout logic', () => {
        it('should apply rollout defaults for flags not in API response', async () => {
          // Test with a version where some flags should be rolled out by default
          setupLegacyFetchHandlers(
            { version: '17.3.0' },
            {}, // No flags returned by API
          );

          await featureFlagService.updateInstanceFeatureFlags();

          // These flags are introduced in 17.1.0 but only rolled out by default from 17.4.0
          // So in 17.3.0 they should be disabled by default
          expect(
            featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.EditorAdvancedContext),
          ).toBe(false);
          expect(
            featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.CodeSuggestionsContext),
          ).toBe(false);

          // DuoWorkflow is introduced in 17.2.0 but not yet rolled out in 17.3.0
          expect(featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.DuoWorkflow)).toBe(
            false,
          );
        });
      });

      describe('with API errors', () => {
        it('should handle non-GraphQL errors gracefully', async () => {
          setupLegacyFetchHandlers({ version: '17.3.0' }, {});

          // Override to throw a different error type
          jest.mocked(api.fetchFromApi).mockImplementation((request) => {
            if (request === versionRequest) {
              return Promise.resolve({ version: '17.3.0' });
            }
            return Promise.reject(new Error('Network error'));
          });

          await featureFlagService.updateInstanceFeatureFlags();

          // All flags should use default logic when API fails
          // These flags are introduced in 17.1.0 but only rolled out by default from 17.4.0
          // So in 17.3.0 they should be disabled by default
          expect(
            featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.EditorAdvancedContext),
          ).toBe(false);
          expect(
            featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.CodeSuggestionsContext),
          ).toBe(false);
        });
      });
    });

    describe('with older instance', () => {
      beforeEach(() => {
        setupFetchHandlers({ version: '17.0.0' }, {});
      });

      it('should disable all flags by default for older versions', async () => {
        await featureFlagService.updateInstanceFeatureFlags();

        Object.values(InstanceFeatureFlags).forEach((flag) => {
          expect(featureFlagService.isInstanceFlagEnabled(flag)).toBe(false);
        });
      });
    });

    describe('with rolled out feature flags', () => {
      it('should enable rolled out feature flags by default', async () => {
        setupFetchHandlers(
          { version: '999.0.0' },
          {
            metadata: {
              featureFlags: [],
            },
          },
        );

        await featureFlagService.updateInstanceFeatureFlags();

        expect(featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.DuoWorkflow)).toBe(
          true,
        );
        expect(
          featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.EditorAdvancedContext),
        ).toBe(true);
        expect(
          featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.CodeSuggestionsContext),
        ).toBe(true);
      });

      it('should disable feature flags when disabled in instance', async () => {
        setupFetchHandlers(
          { version: '18.1.0' },
          {
            metadata: {
              featureFlags: [{ name: InstanceFeatureFlags.DuoWorkflow, enabled: false }],
            },
          },
        );

        await featureFlagService.updateInstanceFeatureFlags();

        expect(featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.DuoWorkflow)).toBe(
          false,
        );
      });

      it('should disable feature flags that have not been introduced yet', async () => {
        setupFetchHandlers(
          { version: '17.5.0' },
          {
            metadata: {
              featureFlags: [{ name: InstanceFeatureFlags.DuoWorkflow, enabled: true }],
            },
          },
        );

        await featureFlagService.updateInstanceFeatureFlags();

        // UseDuoContextExclusion is introduced in 18.2.0, so it should be disabled at 17.5.0
        expect(
          featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.UseDuoContextExclusion),
        ).toBe(false);
        expect(featureFlagService.isInstanceFlagEnabled(InstanceFeatureFlags.DuoWorkflow)).toBe(
          true,
        );
      });
    });

    it('should re-fetch instance flags when API is reconfigured', async () => {
      setupFetchHandlers(
        { version: '17.4.0' },
        {
          metadata: {
            featureFlags: Object.values(InstanceFeatureFlags).map((name) => ({
              name,
              enabled: true,
            })),
          },
        },
      );

      await featureFlagService.updateInstanceFeatureFlags();
      jest.mocked(api.fetchFromApi).mockClear();

      const reconfigureListener = jest.mocked(api.onApiReconfigured).mock.calls[0][0];
      await reconfigureListener(createFakePartial<ApiReconfiguredData>({ isInValidState: true }));

      expect(api.fetchFromApi).toHaveBeenCalledWith(versionRequest);
      expect(api.fetchFromApi).toHaveBeenCalledWith(
        getInstanceFeatureFlagsRequest(Object.values(InstanceFeatureFlags)),
      );
    });

    it('should throttle re-fetch and only make one request when called many times rapidly', async () => {
      setupFetchHandlers(
        { version: '17.4.0' },
        {
          metadata: {
            featureFlags: Object.values(InstanceFeatureFlags).map((name) => ({
              name,
              enabled: true,
            })),
          },
        },
      );

      for (let i = 0; i < 10; i++) {
        // eslint-disable-next-line no-await-in-loop
        await featureFlagService.updateInstanceFeatureFlags();
      }

      // Should only call once due to throttling (version + feature flags request)
      expect(api.fetchFromApi).toHaveBeenCalledTimes(2);
    });

    it('should handle API errors gracefully', async () => {
      jest.mocked(api.fetchFromApi).mockRejectedValue(new Error('API Error'));

      await featureFlagService.updateInstanceFeatureFlags();

      // All flags should default to false when API fails
      Object.values(InstanceFeatureFlags).forEach((flag) => {
        expect(featureFlagService.isInstanceFlagEnabled(flag)).toBe(false);
      });

      expect(mockLogger.error).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('isInstanceFlagEnabled', () => {
    it('should return the cached value if available', async () => {
      setupFetchHandlers(
        { version: '17.4.0' },
        {
          metadata: {
            featureFlags: [{ name: InstanceFeatureFlags.EditorAdvancedContext, enabled: true }],
          },
        },
      );

      await featureFlagService.updateInstanceFeatureFlags();

      const result = featureFlagService.isInstanceFlagEnabled(
        InstanceFeatureFlags.EditorAdvancedContext,
      );

      expect(result).toBe(true);
    });

    it('should return false if not enabled', async () => {
      setupFetchHandlers(
        { version: '17.4.0' },
        {
          metadata: {
            featureFlags: [{ name: InstanceFeatureFlags.EditorAdvancedContext, enabled: false }],
          },
        },
      );

      await featureFlagService.updateInstanceFeatureFlags();

      const result = featureFlagService.isInstanceFlagEnabled(
        InstanceFeatureFlags.EditorAdvancedContext,
      );

      expect(result).toBe(false);
    });

    it('should return false if not in cache', async () => {
      const result = featureFlagService.isInstanceFlagEnabled(
        InstanceFeatureFlags.CodeSuggestionsContext,
      );

      expect(result).toBe(false);
    });
  });

  describe('onChanged', () => {
    it('should emit initial state to new listeners immediately', () => {
      const mockListener = jest.fn();

      const disposable = featureFlagService.onChanged(mockListener);

      expect(mockListener).toHaveBeenCalledWith(new Map());

      disposable.dispose();
    });

    it('should emit feature flag changes to onChanged listeners', async () => {
      const mockListener = jest.fn();

      const disposable = featureFlagService.onChanged(mockListener);
      mockListener.mockClear(); // Clear the initial call

      setupFetchHandlers(
        { version: '17.4.0' },
        {
          metadata: {
            featureFlags: [
              { name: InstanceFeatureFlags.EditorAdvancedContext, enabled: true },
              { name: InstanceFeatureFlags.DuoWorkflow, enabled: false },
            ],
          },
        },
      );

      await featureFlagService.updateInstanceFeatureFlags();

      expect(mockListener).toHaveBeenCalledTimes(1);
      const emittedFlags = mockListener.mock.calls[0][0] as Map<string, boolean>;
      expect(emittedFlags.get(InstanceFeatureFlags.EditorAdvancedContext)).toBe(true);
      expect(emittedFlags.get(InstanceFeatureFlags.DuoWorkflow)).toBe(false);

      disposable.dispose();
    });

    it('should support multiple onChanged listeners', async () => {
      const mockListener1 = jest.fn();
      const mockListener2 = jest.fn();

      const disposable1 = featureFlagService.onChanged(mockListener1);
      const disposable2 = featureFlagService.onChanged(mockListener2);

      expect(mockListener1).toHaveBeenCalledTimes(1);
      expect(mockListener2).toHaveBeenCalledTimes(1);

      mockListener1.mockClear();
      mockListener2.mockClear();

      setupFetchHandlers(
        { version: '17.4.0' },
        {
          metadata: {
            featureFlags: [{ name: InstanceFeatureFlags.EditorAdvancedContext, enabled: true }],
          },
        },
      );

      await featureFlagService.updateInstanceFeatureFlags();

      expect(mockListener1).toHaveBeenCalledTimes(1);
      expect(mockListener2).toHaveBeenCalledTimes(1);
      expect(mockListener1.mock.calls[0][0]).toEqual(mockListener2.mock.calls[0][0]);

      disposable1.dispose();
      disposable2.dispose();
    });
  });
});
