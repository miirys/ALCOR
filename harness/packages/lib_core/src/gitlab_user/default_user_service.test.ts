import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { ApiReconfiguredData, EventListener, GitLabApiService } from '../index';
import { DefaultUserService } from './default_user_service';

const mockUserResponse = {
  currentUser: {
    id: 'gid://gitlab/User/12345',
    username: 'test-user',
    name: 'Test User',
    avatarUrl: 'https://example.com/avatar.jpg',
    webUrl: 'https://example.com/',
    userPreferences: {
      duoDefaultNamespace: {
        id: 'gid://gitlab/Group/67890',
        fullName: 'Test Namespace',
        fullPath: 'test-namespace',
      },
    },
  },
};

const { signal } = new AbortController();

describe('UserService', () => {
  let apiClient: GitLabApiService;
  let service: DefaultUserService;
  let listener: EventListener<ApiReconfiguredData>;
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
    apiClient = createFakePartial<GitLabApiService>({
      fetchFromApi: jest.fn(),
      onApiReconfigured: (l) => {
        listener = l;
        return { dispose: () => {} };
      },
    });
    service = new DefaultUserService(logger, apiClient);
  });
  it('fetches the user from API', async () => {
    jest.mocked(apiClient.fetchFromApi).mockResolvedValue(mockUserResponse);

    await listener(createFakePartial<ApiReconfiguredData>({ isInValidState: true }), signal);

    expect(service.user).toEqual({
      id: 'gid://gitlab/User/12345',
      restId: 12345,
      username: 'test-user',
      name: 'Test User',
      avatarUrl: 'https://example.com/avatar.jpg',
      duoDefaultNamespacePath: 'test-namespace',
      duoDefaultNamespaceId: '67890',
    });
  });

  describe('user avatar', () => {
    it.each`
      avatarUrl                                                    | webUrl                  | expectedAvatarUrl
      ${''}                                                        | ${'http://example.com'} | ${''}
      ${undefined}                                                 | ${'http://example.com'} | ${''}
      ${undefined}                                                 | ${'http://example.com'} | ${''}
      ${'https://foo.bar/avatar.png'}                              | ${'http://example.com'} | ${'https://foo.bar/avatar.png'}
      ${'/foo/bar/avatar.png'}                                     | ${'http://example.com'} | ${'http://example.com/foo/bar/avatar.png'}
      ${'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAggg=='} | ${'http://example.com'} | ${'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAggg=='}
      ${''}                                                        | ${''}                   | ${''}
      ${undefined}                                                 | ${''}                   | ${''}
      ${undefined}                                                 | ${''}                   | ${''}
      ${'https://foo.bar/avatar.png'}                              | ${''}                   | ${'https://foo.bar/avatar.png'}
      ${'/foo/bar/avatar.png'}                                     | ${''}                   | ${''}
      ${'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAggg=='} | ${''}                   | ${'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAggg=='}
    `(
      'correctly returns "$expectedAvatarUrl" as user avatar URL when avatarUrl="$avatarUrl", and webUrl="$webUrl"',
      async ({ avatarUrl, webUrl, expectedAvatarUrl }) => {
        jest.mocked(apiClient.fetchFromApi).mockResolvedValue({
          currentUser: {
            ...mockUserResponse.currentUser,
            avatarUrl,
            webUrl,
          },
        });

        await listener(createFakePartial<ApiReconfiguredData>({ isInValidState: true }), signal);

        expect(service.user).toEqual({
          id: 'gid://gitlab/User/12345',
          restId: 12345,
          username: 'test-user',
          name: 'Test User',
          avatarUrl: expectedAvatarUrl,
          duoDefaultNamespacePath: 'test-namespace',
          duoDefaultNamespaceId: '67890',
        });
      },
    );
  });

  describe('getUser', () => {
    describe('when user is already fetched', () => {
      beforeEach(async () => {
        jest.mocked(apiClient.fetchFromApi).mockResolvedValue(mockUserResponse);
        await listener(createFakePartial<ApiReconfiguredData>({ isInValidState: true }), signal);
      });

      it('returns the user immediately', async () => {
        const result = await service.getUser();

        expect(result).toEqual({
          id: 'gid://gitlab/User/12345',
          restId: 12345,
          username: 'test-user',
          name: 'Test User',
          avatarUrl: 'https://example.com/avatar.jpg',
          duoDefaultNamespacePath: 'test-namespace',
          duoDefaultNamespaceId: '67890',
        });
      });
    });

    describe('when user is not yet fetched', () => {
      it('waits for user to be fetched and resolves', async () => {
        jest.mocked(apiClient.fetchFromApi).mockResolvedValue(mockUserResponse);

        const userPromise = service.getUser();
        await listener(createFakePartial<ApiReconfiguredData>({ isInValidState: true }), signal);

        const result = await userPromise;
        expect(result).toEqual({
          id: 'gid://gitlab/User/12345',
          restId: 12345,
          username: 'test-user',
          name: 'Test User',
          avatarUrl: 'https://example.com/avatar.jpg',
          duoDefaultNamespacePath: 'test-namespace',
          duoDefaultNamespaceId: '67890',
        });
      });

      it('rejects when user fetch fails', async () => {
        const fetchError = new Error('API failed');
        jest.mocked(apiClient.fetchFromApi).mockRejectedValue(fetchError);

        const userPromise = service.getUser();
        await listener(createFakePartial<ApiReconfiguredData>({ isInValidState: true }), signal);

        await expect(userPromise).rejects.toThrow('API failed');
      });
    });
  });

  describe('with user already present', () => {
    beforeEach(async () => {
      jest.mocked(apiClient.fetchFromApi).mockResolvedValue(mockUserResponse);
      await listener(createFakePartial<ApiReconfiguredData>({ isInValidState: true }), signal);
    });

    it('clears user when the API is not in valid state', async () => {
      await listener({ isInValidState: false, validationMessage: 'error' }, signal);

      expect(service.user).toBeUndefined();
    });

    it('clears user when the API call fails', async () => {
      jest.mocked(apiClient.fetchFromApi).mockRejectedValue(new Error('test error'));
      await listener(createFakePartial<ApiReconfiguredData>({ isInValidState: true }), signal);

      expect(service.user).toBeUndefined();
    });
  });

  describe('falls back to null response for earlier instance', () => {
    it('handles missing userPreferences for instances before 18.10.0', async () => {
      const userResponseWithoutPreferences = {
        currentUser: {
          id: 'gid://gitlab/User/12345',
          username: 'test-user',
          name: 'Test User',
          avatarUrl: 'https://example.com/avatar.jpg',
          webUrl: 'https://example.com/',
          userPreferences: null,
        },
      };
      jest.mocked(apiClient.fetchFromApi).mockResolvedValue(userResponseWithoutPreferences);

      await listener(createFakePartial<ApiReconfiguredData>({ isInValidState: true }), signal);

      expect(service.user).toEqual({
        id: 'gid://gitlab/User/12345',
        restId: 12345,
        username: 'test-user',
        name: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        duoDefaultNamespacePath: undefined,
        duoDefaultNamespaceId: undefined,
      });
    });

    it('handles missing duoDefaultNamespace within userPreferences', async () => {
      const userResponseWithoutNamespace = {
        currentUser: {
          id: 'gid://gitlab/User/12345',
          username: 'test-user',
          name: 'Test User',
          avatarUrl: 'https://example.com/avatar.jpg',
          webUrl: 'https://example.com/',
          userPreferences: {
            duoDefaultNamespace: null,
          },
        },
      };
      jest.mocked(apiClient.fetchFromApi).mockResolvedValue(userResponseWithoutNamespace);

      await listener(createFakePartial<ApiReconfiguredData>({ isInValidState: true }), signal);

      expect(service.user).toEqual({
        id: 'gid://gitlab/User/12345',
        restId: 12345,
        username: 'test-user',
        name: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        duoDefaultNamespacePath: undefined,
        duoDefaultNamespaceId: undefined,
      });
    });
  });
});
