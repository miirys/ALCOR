import { createFakePartial } from '@gitlab-org/test-utils';
import { StatelessRepository } from '../../stateless_repository';
import { parseGitLabRemote, tryParseRepositoryGitLabRemoteDetails } from './git_remote_parser';

describe('parse GitLab remote', () => {
  it.each([
    [
      'git@gitlab.com:fatihacet/gitlab-vscode-extension.git',
      { host: 'gitlab.com', namespace: 'fatihacet', projectPath: 'gitlab-vscode-extension' },
    ],
    [
      'ssh://git@gitlab.com:fatihacet/gitlab-vscode-extension.git',
      { host: 'gitlab.com', namespace: 'fatihacet', projectPath: 'gitlab-vscode-extension' },
    ],
    [
      'git://git@gitlab.com:fatihacet/gitlab-vscode-extension.git',
      { host: 'gitlab.com', namespace: 'fatihacet', projectPath: 'gitlab-vscode-extension' },
    ],
    [
      'http://git@gitlab.com/fatihacet/gitlab-vscode-extension.git',
      { host: 'gitlab.com', namespace: 'fatihacet', projectPath: 'gitlab-vscode-extension' },
    ],
    [
      'http://gitlab.com/fatihacet/gitlab-vscode-extension.git',
      { host: 'gitlab.com', namespace: 'fatihacet', projectPath: 'gitlab-vscode-extension' },
    ],
    [
      'https://git@gitlab.com/fatihacet/gitlab-vscode-extension.git',
      { host: 'gitlab.com', namespace: 'fatihacet', projectPath: 'gitlab-vscode-extension' },
    ],
    [
      'https://gitlab.com/fatihacet/gitlab-vscode-extension.git',
      { host: 'gitlab.com', namespace: 'fatihacet', projectPath: 'gitlab-vscode-extension' },
    ],
    [
      'git@gitlab.com:group/subgroup/gitlab-vscode-extension.git',
      { host: 'gitlab.com', namespace: 'group/subgroup', projectPath: 'gitlab-vscode-extension' },
    ],
    [
      'http://gitlab.com/group/subgroup/gitlab-vscode-extension.git',
      { host: 'gitlab.com', namespace: 'group/subgroup', projectPath: 'gitlab-vscode-extension' },
    ],
    [
      'https://gitlab.com/fatihacet/gitlab-vscode-extension',
      { host: 'gitlab.com', namespace: 'fatihacet', projectPath: 'gitlab-vscode-extension' },
    ],
    [
      'https://gitlab.com/fatihacet/gitlab-vscode-extension.git',
      { host: 'gitlab.com', namespace: 'fatihacet', projectPath: 'gitlab-vscode-extension' },
    ],
    [
      'https://gitlab.com:8443/fatihacet/gitlab-vscode-extension.git',
      { host: 'gitlab.com:8443', namespace: 'fatihacet', projectPath: 'gitlab-vscode-extension' },
    ],
    [
      'https://gitlab.com:8443/fatihacet/gitlab-vscode-extension/',
      { host: 'gitlab.com:8443', namespace: 'fatihacet', projectPath: 'gitlab-vscode-extension' },
    ],
    [
      '[git@gitlab.com:2222]:fatihacet/gitlab-vscode-extension.git',
      { host: 'gitlab.com:2222', namespace: 'fatihacet', projectPath: 'gitlab-vscode-extension' },
    ],
    [
      'git@gitlab.com:2222/fatihacet/gitlab-vscode-extension.git',
      { host: 'gitlab.com:2222', namespace: 'fatihacet', projectPath: 'gitlab-vscode-extension' },
    ],
    [
      'ssh://gitlab.com:2222/fatihacet/gitlab-vscode-extension.git',
      { host: 'gitlab.com:2222', namespace: 'fatihacet', projectPath: 'gitlab-vscode-extension' },
    ],
  ])('should parse %s', (remote, parsed) => {
    const { host, namespace, projectPath } = parsed;
    expect(parseGitLabRemote(remote, 'https://gitlab.com')).toEqual({
      host,
      namespace,
      projectPath,
      namespaceWithPath: `${namespace}/${projectPath}`,
    });
  });

  it.each([
    'git@gitlab.company.com:fatihacet/gitlab-vscode-extension.git',
    'ssh://git@gitlab.company.com:fatihacet/gitlab-vscode-extension.git',
    'git://git@gitlab.company.com:fatihacet/gitlab-vscode-extension.git',
    'http://git@gitlab.company.com/fatihacet/gitlab-vscode-extension.git',
    'http://gitlab.company.com/fatihacet/gitlab-vscode-extension.git',
    'https://git@gitlab.company.com/fatihacet/gitlab-vscode-extension.git',
    'https://gitlab.company.com/fatihacet/gitlab-vscode-extension.git',
    'git@gitlab.company.com:group/subgroup/gitlab-vscode-extension.git',
    'http://gitlab.company.com/group/subgroup/gitlab-vscode-extension.git',
    'https://gitlab.company.com/fatihacet/gitlab-vscode-extension',
    'https://gitlab.company.com/fatihacet/gitlab-vscode-extension.git',
    'https://gitlab.company.com:8443/fatihacet/gitlab-vscode-extension.git',
    'https://gitlab.company.com:8443/fatihacet/gitlab-vscode-extension/',
    '[git@gitlab.company.com:2222]:fatihacet/gitlab-vscode-extension.git',
    'git@gitlab.company.com:2222/fatihacet/gitlab-vscode-extension.git',
    'ssh://gitlab.company.com:2222/fatihacet/gitlab-vscode-extension.git',
  ])(
    'should retun "undefined" when  remote "hostname" does not match user instance URL',
    (remote) => {
      expect(parseGitLabRemote(remote, 'https://gitlab.com')).toBeUndefined();
    },
  );

  // For more details see https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/merge_requests/11
  it('should support self managed GitLab on a custom path', () => {
    expect(
      parseGitLabRemote(
        'https://example.com/gitlab/fatihacet/gitlab-vscode-extension',
        'https://example.com/gitlab',
      ),
    ).toEqual({
      host: 'example.com',
      namespace: 'fatihacet',
      projectPath: 'gitlab-vscode-extension',
      namespaceWithPath: 'fatihacet/gitlab-vscode-extension',
    });
  });
  // For more details see: https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/103
  it('should parse remote URLs without custom path even if the instance has custom path', () => {
    expect(
      parseGitLabRemote(
        'git@example.com:fatihacet/gitlab-vscode-extension.git',
        'https://example.com/gitlab',
      ),
    ).toEqual({
      host: 'example.com',
      namespace: 'fatihacet',
      projectPath: 'gitlab-vscode-extension',
      namespaceWithPath: 'fatihacet/gitlab-vscode-extension',
    });
  });

  it('fails to parse remote URL without namespace', () => {
    expect(parseGitLabRemote('git@host:no-namespace-repo.git', '')).toBeUndefined();
  });

  it('fails to parse relative path', () => {
    expect(parseGitLabRemote('../relative/path', '')).toBeUndefined();
  });

  describe('GDK remote parsing', () => {
    it.each([
      [
        'SSH with scheme',
        'ssh://git@gdk.test:2222/gitlab-duo/test.git',
        'https://gdk.test:3443',
        { host: 'gdk.test:2222', namespace: 'gitlab-duo', projectPath: 'test' },
      ],
      [
        'SSH without scheme',
        'git@gdk.test:3000/gitlab-duo/test.git',
        'http://gdk.test:3000',
        { host: 'gdk.test:3000', namespace: 'gitlab-duo', projectPath: 'test' },
      ],
      [
        'SSH without scheme with nested groups',
        'git@localhost:8022/group/subgroup/project.git',
        'http://localhost:3000',
        { host: 'localhost:8022', namespace: 'group/subgroup', projectPath: 'project' },
      ],
      [
        'SSH without scheme with IP address',
        'git@127.0.0.1:2222/root/project.git',
        'http://127.0.0.1:3000',
        { host: '127.0.0.1:2222', namespace: 'root', projectPath: 'project' },
      ],
    ])('should correctly parse %s', (_description, remote, instanceUrl, expected) => {
      const { host, namespace, projectPath } = expected;
      expect(parseGitLabRemote(remote, instanceUrl)).toEqual({
        host,
        namespace,
        projectPath,
        namespaceWithPath: `${namespace}/${projectPath}`,
      });
    });
  });
});

describe('tryParseRepositoryGitLabRemoteDetails', () => {
  const gitlabInstanceUrl = 'https://gitlab.example.com';

  describe('when origin remote exists', () => {
    let mockRepository: StatelessRepository;

    beforeEach(() => {
      mockRepository = createFakePartial<StatelessRepository>({
        listRemotes: jest.fn().mockResolvedValue([
          { remote: 'upstream', url: 'git@gitlab.example.com:upstream/project.git' },
          { remote: 'origin', url: 'git@gitlab.example.com:example-namespace/example-project.git' },
          { remote: 'fork', url: 'git@gitlab.example.com:fork/project.git' },
        ]),
      });
    });

    it('should parse the origin remote', async () => {
      const result = await tryParseRepositoryGitLabRemoteDetails(mockRepository, gitlabInstanceUrl);

      expect(result).toEqual({
        host: 'gitlab.example.com',
        namespace: 'example-namespace',
        projectPath: 'example-project',
        namespaceWithPath: 'example-namespace/example-project',
      });
    });
  });

  describe('when no origin remote exists', () => {
    let mockRepository: StatelessRepository;

    beforeEach(() => {
      mockRepository = createFakePartial<StatelessRepository>({
        listRemotes: jest.fn().mockResolvedValue([
          { remote: 'upstream', url: 'git@gitlab.example.com:upstream/project.git' },
          { remote: 'fork', url: 'git@gitlab.example.com:fork/project.git' },
        ]),
      });
    });

    it('should fall back to first remote', async () => {
      const result = await tryParseRepositoryGitLabRemoteDetails(mockRepository, gitlabInstanceUrl);

      expect(result).toEqual({
        host: 'gitlab.example.com',
        namespace: 'upstream',
        projectPath: 'project',
        namespaceWithPath: 'upstream/project',
      });
      expect(mockRepository.listRemotes).toHaveBeenCalledTimes(1);
    });
  });

  describe('when unable to parse remote details', () => {
    it.each([
      { scenario: 'no remotes exist', remotes: [] },
      { scenario: 'remote URL is undefined', remotes: [{ remote: 'origin', url: undefined }] },
      { scenario: 'remote URL is empty', remotes: [{ remote: 'origin', url: '' }] },
    ])('should return undefined when $scenario', async ({ remotes }) => {
      const mockRepository = createFakePartial<StatelessRepository>({
        listRemotes: jest.fn().mockResolvedValue(remotes),
      });

      const result = await tryParseRepositoryGitLabRemoteDetails(mockRepository, gitlabInstanceUrl);

      expect(result).toBeUndefined();
      expect(mockRepository.listRemotes).toHaveBeenCalledTimes(1);
    });
  });

  describe('when repository is unable to list remotes', () => {
    let mockRepository: StatelessRepository;

    beforeEach(() => {
      mockRepository = createFakePartial<StatelessRepository>({
        listRemotes: jest.fn().mockRejectedValue(new Error('Ruh roh, git command failed')),
      });
    });

    it('should throw meaningful error with original error message', async () => {
      await expect(
        tryParseRepositoryGitLabRemoteDetails(mockRepository, gitlabInstanceUrl),
      ).rejects.toThrow(
        'Failed to parse GitLab remotes from repository: Ruh roh, git command failed',
      );

      expect(mockRepository.listRemotes).toHaveBeenCalledTimes(1);
    });
  });
});
