import { gitClone, GitCloneError } from './git_clone';

const mockClone = jest.fn();
const mockEnv = jest.fn();
const mockRevparse = jest.fn();

jest.mock('simple-git', () => ({
  simpleGit: jest.fn(() => ({
    env: mockEnv,
    clone: mockClone,
    revparse: mockRevparse,
  })),
}));

describe('git/git_clone', () => {
  beforeEach(() => {
    mockEnv.mockReturnValue({ clone: mockClone });
    mockClone.mockResolvedValue('');
    mockRevparse.mockResolvedValue('abc123def456\n');
  });

  describe('when called with a url and dest', () => {
    it('delegates to simple-git clone, shallow by default', async () => {
      await gitClone({ url: 'https://gitlab.com/team/plugins.git', dest: '/tmp/dest' });
      expect(mockClone).toHaveBeenCalledWith('https://gitlab.com/team/plugins.git', '/tmp/dest', [
        '--depth',
        '1',
      ]);
    });

    it('inherits the environment and sets GIT_TERMINAL_PROMPT=0 so private repos fail fast', async () => {
      await gitClone({ url: 'https://gitlab.com/team/plugins.git', dest: '/tmp/dest' });
      expect(mockEnv).toHaveBeenCalledWith(
        expect.objectContaining({ PATH: process.env.PATH, GIT_TERMINAL_PROMPT: '0' }),
      );
    });

    it('returns the checked-out HEAD sha, trimmed', async () => {
      const result = await gitClone({
        url: 'https://gitlab.com/team/plugins.git',
        dest: '/tmp/dest',
      });
      expect(mockRevparse).toHaveBeenCalledWith(['HEAD']);
      expect(result).toEqual({ sha: 'abc123def456' });
    });
  });

  describe('when a ref is provided', () => {
    it('passes the ref as --branch alongside the shallow depth', async () => {
      await gitClone({
        url: 'https://gitlab.com/team/plugins.git',
        dest: '/tmp/dest',
        ref: 'v2.0',
      });
      expect(mockClone).toHaveBeenCalledWith('https://gitlab.com/team/plugins.git', '/tmp/dest', [
        '--depth',
        '1',
        '--branch',
        'v2.0',
      ]);
    });
  });

  describe('when the underlying clone fails', () => {
    beforeEach(() => {
      mockClone.mockRejectedValue(new Error('fatal: repository not found'));
    });

    it('wraps the failure with context, preserving the cause', async () => {
      await expect(
        gitClone({ url: 'https://gitlab.com/missing.git', dest: '/tmp/dest' }),
      ).rejects.toThrow(GitCloneError);
      await expect(
        gitClone({ url: 'https://gitlab.com/missing.git', dest: '/tmp/dest' }),
      ).rejects.toThrow(
        /Failed to clone "https:\/\/gitlab\.com\/missing\.git": fatal: repository not found/,
      );
    });
  });
});
