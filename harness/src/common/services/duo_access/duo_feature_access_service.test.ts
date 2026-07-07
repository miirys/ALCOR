import { GitLabApiService, InstanceInfo, ApiReconfiguredData } from '@gitlab-org/core';
import { TestLogger } from '@gitlab-org/logging';
import { ConfigService, DefaultConfigService } from '@gitlab-org/config';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DuoFeature, DuoCodeSuggestionsContext } from '@gitlab-org/duo-feature-access';
import { DefaultDuoFeatureAccessService } from './duo_feature_access_service';

describe('DuoFeatureAccessService', () => {
  let service: DefaultDuoFeatureAccessService;
  let mockGitLabApiService: GitLabApiService;
  let configService: ConfigService;
  let logger: TestLogger;
  let onApiReconfiguredCallback: (data: ApiReconfiguredData) => void;

  beforeEach(() => {
    logger = new TestLogger();
    mockGitLabApiService = createFakePartial<GitLabApiService>({
      fetchFromApi: jest.fn(),
      onApiReconfigured: jest.fn((callback) => {
        onApiReconfiguredCallback = callback;
        return { dispose: jest.fn() };
      }),
      instanceInfo: createFakePartial<InstanceInfo>({ instanceVersion: '17.9.0' }),
    });

    configService = new DefaultConfigService();
    configService.set('codeCompletion.enabled', true);
    configService.set('duoChat.enabled', true);
    configService.set('duo.agentPlatform.enabled', true);

    service = new DefaultDuoFeatureAccessService(logger, mockGitLabApiService, configService);

    onApiReconfiguredCallback(
      createFakePartial<ApiReconfiguredData>({
        isInValidState: true,
      }),
    );
  });

  describe('isChatFeatureEnabled', () => {
    it('returns enabled when feature is available', async () => {
      jest.mocked(mockGitLabApiService.fetchFromApi).mockResolvedValue({
        currentUser: {
          duoChatAvailableFeatures: [DuoFeature.IncludeIssueContext],
          codeSuggestionsContexts: [],
        },
      });

      onApiReconfiguredCallback(
        createFakePartial<ApiReconfiguredData>({
          isInValidState: true,
        }),
      );

      const result = await service.isChatFeatureEnabled(DuoFeature.IncludeIssueContext);

      expect(result).toBe(true);
    });

    it('returns disabled when feature is not available', async () => {
      jest.mocked(mockGitLabApiService.fetchFromApi).mockResolvedValue({
        currentUser: {
          duoChatAvailableFeatures: [],
          codeSuggestionsContexts: [],
        },
      });

      onApiReconfiguredCallback(
        createFakePartial<ApiReconfiguredData>({
          isInValidState: true,
        }),
      );

      const result = await service.isChatFeatureEnabled(DuoFeature.IncludeIssueContext);

      expect(result).toBe(false);
    });

    it('returns disabled when all Duo features are disabled', async () => {
      configService.set('codeCompletion.enabled', false);
      configService.set('duo.agentPlatform.enabled', false);
      jest.mocked(mockGitLabApiService.fetchFromApi).mockClear();
      configService.set('duoChat.enabled', false);

      const result = await service.isChatFeatureEnabled(DuoFeature.IncludeIssueContext);

      expect(result).toBe(false);
      expect(mockGitLabApiService.fetchFromApi).not.toHaveBeenCalled();
    });

    it('still fetches features when only agent platform is enabled', async () => {
      jest.mocked(mockGitLabApiService.fetchFromApi).mockResolvedValue({
        currentUser: {
          duoChatAvailableFeatures: [DuoFeature.IncludeIssueContext],
          codeSuggestionsContexts: [],
        },
      });

      configService.set('codeCompletion.enabled', false);
      configService.set('duoChat.enabled', false);
      configService.set('duo.agentPlatform.enabled', true);

      onApiReconfiguredCallback(
        createFakePartial<ApiReconfiguredData>({
          isInValidState: true,
        }),
      );

      const result = await service.isChatFeatureEnabled(DuoFeature.IncludeIssueContext);

      expect(result).toBe(true);
      expect(mockGitLabApiService.fetchFromApi).toHaveBeenCalled();
    });
  });

  describe('isSuggestionsFeatureEnabled', () => {
    it('returns enabled when feature is available', async () => {
      jest.mocked(mockGitLabApiService.fetchFromApi).mockResolvedValue({
        currentUser: {
          duoChatAvailableFeatures: [],
          codeSuggestionsContexts: [DuoCodeSuggestionsContext.OpenTabs],
        },
      });

      onApiReconfiguredCallback(
        createFakePartial<ApiReconfiguredData>({
          isInValidState: true,
        }),
      );

      const result = await service.isSuggestionsFeatureEnabled(DuoCodeSuggestionsContext.OpenTabs);

      expect(result).toBe(true);
    });

    it('returns disabled when feature is not available', async () => {
      jest.mocked(mockGitLabApiService.fetchFromApi).mockResolvedValue({
        currentUser: {
          duoChatAvailableFeatures: [],
          codeSuggestionsContexts: [],
        },
      });
      onApiReconfiguredCallback(
        createFakePartial<ApiReconfiguredData>({
          isInValidState: true,
        }),
      );

      const result = await service.isSuggestionsFeatureEnabled(DuoCodeSuggestionsContext.OpenTabs);

      expect(result).toBe(false);
    });

    it('returns disabled when all Duo features are disabled', async () => {
      configService.set('codeCompletion.enabled', false);
      configService.set('duo.agentPlatform.enabled', false);
      jest.mocked(mockGitLabApiService.fetchFromApi).mockClear();
      configService.set('duoChat.enabled', false);

      const result = await service.isSuggestionsFeatureEnabled(DuoCodeSuggestionsContext.OpenTabs);

      expect(result).toBe(false);
      expect(mockGitLabApiService.fetchFromApi).not.toHaveBeenCalled();
    });
  });

  describe('GraphQL queries', () => {
    it('uses full query for GitLab 17.9.0+', async () => {
      let callback: (data: ApiReconfiguredData) => void;
      const mockApiService = createFakePartial<GitLabApiService>({
        fetchFromApi: jest.fn(),
        onApiReconfigured: jest.fn((cb) => {
          callback = cb;
          return { dispose: jest.fn() };
        }),
        instanceInfo: createFakePartial<InstanceInfo>({ instanceVersion: '17.9.0' }),
      });
      const testService = new DefaultDuoFeatureAccessService(
        new TestLogger(),
        mockApiService,
        configService,
      );

      callback!(
        createFakePartial<ApiReconfiguredData>({
          isInValidState: true,
        }),
      );

      jest.mocked(mockApiService.fetchFromApi).mockResolvedValue({
        currentUser: { duoChatAvailableFeatures: [], codeSuggestionsContexts: [] },
      });

      await testService.isChatFeatureEnabled(DuoFeature.IncludeIssueContext);

      expect(mockApiService.fetchFromApi).toHaveBeenCalledWith({
        type: 'graphql',
        query: expect.stringContaining('codeSuggestionsContexts'),
        variables: {},
        supportedSinceInstanceVersion: {
          version: '17.6.0',
          resourceName: 'get Duo available features',
        },
      });
    });

    it('uses chat-only query for GitLab 17.8.2', async () => {
      let callback: (data: ApiReconfiguredData) => void;
      const mockApiService = createFakePartial<GitLabApiService>({
        fetchFromApi: jest.fn(),
        onApiReconfigured: jest.fn((cb) => {
          callback = cb;
          return { dispose: jest.fn() };
        }),
        instanceInfo: createFakePartial<InstanceInfo>({ instanceVersion: '17.8.2' }),
      });
      const testService = new DefaultDuoFeatureAccessService(
        new TestLogger(),
        mockApiService,
        configService,
      );

      callback!(
        createFakePartial<ApiReconfiguredData>({
          isInValidState: true,
        }),
      );

      jest.mocked(mockApiService.fetchFromApi).mockResolvedValue({
        currentUser: { duoChatAvailableFeatures: [] },
      });

      await testService.isChatFeatureEnabled(DuoFeature.IncludeIssueContext);

      expect(mockApiService.fetchFromApi).toHaveBeenCalledWith({
        type: 'graphql',
        query: expect.not.stringContaining('codeSuggestionsContexts'),
        variables: {},
        supportedSinceInstanceVersion: {
          version: '17.6.0',
          resourceName: 'get Duo available features',
        },
      });
    });
  });
});
