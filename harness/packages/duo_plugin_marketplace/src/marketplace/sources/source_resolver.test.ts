import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveSource } from './source_resolver';

describe('resolveSource', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'src-resolver-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('when the input is an existing directory', () => {
    it('prefers a directory source', async () => {
      expect(await resolveSource(dir)).toEqual({ source: 'directory', path: dir });
    });
  });

  describe('when the input is not a local directory', () => {
    it('falls through to a url source', async () => {
      expect(await resolveSource('https://gitlab.com/team/plugins.git')).toEqual({
        source: 'url',
        url: 'https://gitlab.com/team/plugins.git',
      });
    });
  });
});
