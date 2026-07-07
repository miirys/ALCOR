import { mkdtemp, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveDirectorySource } from './directory_source';

jest.mock('node:fs/promises', () => ({
  ...jest.requireActual('node:fs/promises'),
  stat: jest.fn(),
}));

const mockStat = stat as jest.MockedFunction<typeof stat>;
const realStat = jest.requireActual('node:fs/promises').stat as typeof stat;

describe('resolveDirectorySource', () => {
  let dir: string;

  beforeEach(async () => {
    mockStat.mockImplementation(realStat);
    dir = await mkdtemp(join(tmpdir(), 'dir-source-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('when the input is an existing absolute directory', () => {
    it('resolves to a directory source', async () => {
      expect(await resolveDirectorySource(dir)).toEqual({ source: 'directory', path: dir });
    });
  });

  describe('when the input starts with ~', () => {
    it('expands the leading ~ before checking', async () => {
      expect(await resolveDirectorySource('~')).toEqual({ source: 'directory', path: homedir() });
    });
  });

  describe('when the path is not on the filesystem', () => {
    it('returns null', async () => {
      expect(await resolveDirectorySource('/no/such/dir/xyz')).toBeNull();
    });
  });

  describe('when the input is a URL', () => {
    it('returns null', async () => {
      expect(await resolveDirectorySource('https://gitlab.com/team/plugins.git')).toBeNull();
    });
  });

  describe('when the path exists but is not readable', () => {
    it.each(['EACCES', 'EPERM'])('throws a permission error for %s', async (code) => {
      const error = Object.assign(new Error('denied'), { code });
      mockStat.mockRejectedValue(error);

      await expect(resolveDirectorySource('/root/secret')).rejects.toThrow(/permission denied/);
    });
  });
});
