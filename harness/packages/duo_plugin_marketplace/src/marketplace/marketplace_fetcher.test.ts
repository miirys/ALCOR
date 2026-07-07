import { access, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NullLogger } from '@gitlab-org/logging';
import { gitClone } from '../git/git_clone';
import { DefaultMarketplaceFetcher } from './marketplace_fetcher';
import * as paths from './paths';

jest.mock('../git/git_clone', () => ({
  gitClone: jest.fn(),
}));

jest.mock('./paths', () => ({
  ...jest.requireActual('./paths'),
  getMarketplacesDir: jest.fn(),
  getInstallLocation: jest.fn(),
}));

const mockGitClone = gitClone as jest.MockedFunction<typeof gitClone>;
const mockGetMarketplacesDir = paths.getMarketplacesDir as jest.MockedFunction<
  typeof paths.getMarketplacesDir
>;
const mockGetInstallLocation = paths.getInstallLocation as jest.MockedFunction<
  typeof paths.getInstallLocation
>;

const validCatalog = {
  name: 'duo-demo',
  owner: { name: 'GitLab' },
  plugins: [{ name: 'gitlab-helper', source: './plugins/gitlab-helper' }],
};

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

describe('DefaultMarketplaceFetcher', () => {
  let root: string;
  let marketplacesDir: string;
  let fetcher: DefaultMarketplaceFetcher;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'fetcher-test-'));
    marketplacesDir = join(root, 'marketplaces');
    mockGetMarketplacesDir.mockReturnValue(marketplacesDir);
    mockGetInstallLocation.mockImplementation((name: string) => join(marketplacesDir, name));
    fetcher = new DefaultMarketplaceFetcher(new NullLogger());
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('directory sources', () => {
    let srcDir: string;

    beforeEach(async () => {
      srcDir = join(root, 'src');
      await mkdir(srcDir, { recursive: true });
    });

    describe('when the directory contains a marketplace.json', () => {
      beforeEach(async () => {
        await writeFile(join(srcDir, 'marketplace.json'), JSON.stringify(validCatalog));
      });

      it('copies the catalog, validates it, and moves it to marketplaces/<name>', async () => {
        const result = await fetcher.fetch({ source: 'directory', path: srcDir });

        expect(result.catalog.name).toBe('duo-demo');
        expect(result.installLocation).toBe(join(marketplacesDir, 'duo-demo'));
        expect(await exists(join(marketplacesDir, 'duo-demo', 'marketplace.json'))).toBe(true);
        expect(mockGitClone).not.toHaveBeenCalled();
      });

      it('has no installedRevision (directory sources have no revision)', async () => {
        const result = await fetcher.fetch({ source: 'directory', path: srcDir });
        expect(result.installedRevision).toBeUndefined();
      });

      it('strips a .git copied from the source directory', async () => {
        await mkdir(join(srcDir, '.git'), { recursive: true });
        await writeFile(join(srcDir, '.git', 'HEAD'), 'ref: refs/heads/main');

        await fetcher.fetch({ source: 'directory', path: srcDir });

        expect(await exists(join(marketplacesDir, 'duo-demo', '.git'))).toBe(false);
        expect(await exists(join(marketplacesDir, 'duo-demo', 'marketplace.json'))).toBe(true);
      });

      it('leaves no temp dirs behind on success', async () => {
        await fetcher.fetch({ source: 'directory', path: srcDir });
        expect(await readdir(marketplacesDir)).toEqual(['duo-demo']);
      });

      it('replaces an existing catalog dir on re-fetch', async () => {
        await fetcher.fetch({ source: 'directory', path: srcDir });
        await writeFile(join(marketplacesDir, 'duo-demo', 'stale.txt'), 'old');

        await fetcher.fetch({ source: 'directory', path: srcDir });

        expect(await exists(join(marketplacesDir, 'duo-demo', 'stale.txt'))).toBe(false);
      });
    });

    describe('when the directory only has .claude-plugin/marketplace.json', () => {
      beforeEach(async () => {
        await mkdir(join(srcDir, '.claude-plugin'), { recursive: true });
        await writeFile(
          join(srcDir, '.claude-plugin', 'marketplace.json'),
          JSON.stringify(validCatalog),
        );
      });

      it('reads it as a fallback', async () => {
        expect((await fetcher.fetch({ source: 'directory', path: srcDir })).catalog.name).toBe(
          'duo-demo',
        );
      });
    });

    describe('when no catalog file exists', () => {
      it('throws a clear error and cleans up', async () => {
        await expect(fetcher.fetch({ source: 'directory', path: srcDir })).rejects.toThrow(
          /No marketplace\.json found/,
        );
        expect(await readdir(marketplacesDir)).toEqual([]);
      });
    });

    describe('when the catalog is invalid', () => {
      beforeEach(async () => {
        await writeFile(join(srcDir, 'marketplace.json'), JSON.stringify({ name: 'Bad Name' }));
      });

      it('surfaces schema validation errors', async () => {
        await expect(fetcher.fetch({ source: 'directory', path: srcDir })).rejects.toThrow(
          /marketplace\.json is invalid/,
        );
      });
    });

    describe('when marketplace.json is not valid JSON', () => {
      beforeEach(async () => {
        await writeFile(join(srcDir, 'marketplace.json'), '{ not json');
      });

      it('throws an error naming the file', async () => {
        await expect(fetcher.fetch({ source: 'directory', path: srcDir })).rejects.toThrow(
          /is not valid JSON/,
        );
      });
    });
  });

  describe('git sources', () => {
    describe('when fetching a git url with a ref', () => {
      beforeEach(() => {
        mockGitClone.mockImplementation(async ({ dest }) => {
          await mkdir(join(dest, '.git'), { recursive: true });
          await writeFile(join(dest, '.git', 'HEAD'), 'ref: refs/heads/main');
          await writeFile(join(dest, 'marketplace.json'), JSON.stringify(validCatalog));
          return { sha: 'deadbeefcafe' };
        });
      });

      it('delegates to gitClone (into a temp dir) with url and ref', async () => {
        const result = await fetcher.fetch({
          source: 'url',
          url: 'https://gitlab.com/team/plugins.git',
          ref: 'v2.0',
        });

        expect(mockGitClone).toHaveBeenCalledWith(
          expect.objectContaining({ url: 'https://gitlab.com/team/plugins.git', ref: 'v2.0' }),
        );
        expect(result.installLocation).toBe(join(marketplacesDir, 'duo-demo'));
      });

      it('records the cloned sha as installedRevision', async () => {
        const result = await fetcher.fetch({
          source: 'url',
          url: 'https://gitlab.com/team/plugins.git',
          ref: 'v2.0',
        });

        expect(result.installedRevision).toBe('deadbeefcafe');
      });

      it('strips .git from the published catalog dir', async () => {
        await fetcher.fetch({
          source: 'url',
          url: 'https://gitlab.com/team/plugins.git',
          ref: 'v2.0',
        });

        expect(await exists(join(marketplacesDir, 'duo-demo', '.git'))).toBe(false);
        expect(await exists(join(marketplacesDir, 'duo-demo', 'marketplace.json'))).toBe(true);
      });
    });
  });
});

describe('DefaultMarketplaceFetcher.readInstalledCatalog', () => {
  let root: string;
  let dir: string;
  let fetcher: DefaultMarketplaceFetcher;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'read-catalog-test-'));
    dir = join(root, 'catalog');
    await mkdir(dir, { recursive: true });
    fetcher = new DefaultMarketplaceFetcher(new NullLogger());
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('when a valid marketplace.json is present', () => {
    it('reads and parses it', async () => {
      await writeFile(join(dir, 'marketplace.json'), JSON.stringify(validCatalog));

      const catalog = await fetcher.readInstalledCatalog(dir);

      expect(catalog.name).toBe('duo-demo');
      expect(catalog.plugins).toHaveLength(1);
    });
  });

  describe('when only .claude-plugin/marketplace.json is present', () => {
    it('reads it as a fallback', async () => {
      await mkdir(join(dir, '.claude-plugin'), { recursive: true });
      await writeFile(
        join(dir, '.claude-plugin', 'marketplace.json'),
        JSON.stringify(validCatalog),
      );

      const catalog = await fetcher.readInstalledCatalog(dir);

      expect(catalog.name).toBe('duo-demo');
      expect(catalog.plugins).toHaveLength(1);
    });
  });

  describe('when no catalog file is present', () => {
    it('rejects', async () => {
      await expect(fetcher.readInstalledCatalog(dir)).rejects.toThrow(/No marketplace\.json found/);
    });
  });

  describe('when the catalog fails schema validation', () => {
    it('rejects', async () => {
      await writeFile(join(dir, 'marketplace.json'), JSON.stringify({ name: 'Bad Name' }));

      await expect(fetcher.readInstalledCatalog(dir)).rejects.toThrow();
    });
  });
});
