import * as git from 'isomorphic-git';
import { GetRemoteInfoResult } from 'isomorphic-git';
import { LsFetch } from '@gitlab-org/fetch';
import { createFakePartial } from '@gitlab-org/test-utils';
import { getRemoteRepositoryInfo } from './git_remote_repository_info';

jest.mock('isomorphic-git', () => ({
  getRemoteInfo: jest.fn(),
}));

describe('getRemoteRepositoryInfo', () => {
  let mockResponse: Response;
  let mockLsFetch: LsFetch;
  let mockRemoteInfo: GetRemoteInfoResult;

  beforeEach(() => {
    mockResponse = createFakePartial<Response>({
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
      url: 'https://example.com',
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
    });
    mockLsFetch = createFakePartial<LsFetch>({
      fetch: jest.fn().mockResolvedValue(mockResponse),
    });
    mockRemoteInfo = createFakePartial<GetRemoteInfoResult>({
      refs: {},
      HEAD: 'refs/head/main',
    });
    jest.mocked(git.getRemoteInfo).mockResolvedValue(mockRemoteInfo);
  });

  it.each([
    ['https://gitlab.com/user/repo.git', 'https://gitlab.com/user/repo.git'],
    ['git@gitlab.com:user/repo.git', 'https://gitlab.com/user/repo.git'],
    ['git://gitlab.com/user/repo.git', 'https://gitlab.com/user/repo.git'],
    ['ssh://git@gitlab.com/user/repo.git', 'https://gitlab.com/user/repo.git'],
  ])('should handle remote URL format: %s', async (input, expected) => {
    await getRemoteRepositoryInfo(mockLsFetch, input);

    expect(git.getRemoteInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expected,
      }),
    );
  });

  it('should return the remote info result', async () => {
    const result = await getRemoteRepositoryInfo(mockLsFetch, 'https://example.com/repo.git');

    expect(result).toBe(mockRemoteInfo);
  });
});
