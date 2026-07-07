import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NullLogger } from '@gitlab-org/logging';
import type { PluginObjectSource } from '../schema/plugin_source';
import { DefaultPluginSourceResolver } from './plugin_source_resolver';

describe('DefaultPluginSourceResolver', () => {
  let dir: string;
  let resolver: DefaultPluginSourceResolver;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'psr-test-'));
    resolver = new DefaultPluginSourceResolver(new NullLogger());
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('resolve with a relative source', () => {
    describe('when the source directory exists', () => {
      it('resolves it against the catalog dir', async () => {
        await mkdir(join(dir, 'plugins', 'foo'), { recursive: true });
        const resolved = await resolver.resolve('./plugins/foo', dir);
        expect(resolved).toBe(join(await realDir(dir), 'plugins', 'foo'));
      });

      it('applies the pluginRoot prefix', async () => {
        await mkdir(join(dir, 'plugins', 'foo'), { recursive: true });
        const resolved = await resolver.resolve('foo', dir, './plugins');
        expect(resolved).toBe(join(await realDir(dir), 'plugins', 'foo'));
      });
    });

    describe('when the source directory does not exist', () => {
      it('throws', async () => {
        await expect(resolver.resolve('./plugins/missing', dir)).rejects.toThrow(/does not exist/);
      });
    });

    describe('when the source contains a .. escape', () => {
      it('rejects the unsafe segment', async () => {
        await expect(resolver.resolve('./../escape', dir)).rejects.toThrow(
          /not a safe path segment/,
        );
      });
    });

    describe('when a symlink escapes the catalog dir', () => {
      it('rejects it', async () => {
        const outside = await mkdtemp(join(tmpdir(), 'psr-outside-'));
        try {
          await symlink(outside, join(dir, 'evil'));
          await expect(resolver.resolve('./evil', dir)).rejects.toThrow(
            /escapes catalog directory/,
          );
        } finally {
          await rm(outside, { recursive: true, force: true });
        }
      });
    });
  });

  describe('resolve with an object source', () => {
    it.each([
      ['github', { source: 'github', repo: 'o/r' }],
      ['url', { source: 'url', url: 'https://e/p.zip' }],
      ['git-subdir', { source: 'git-subdir', url: 'https://e/r.git', path: 'p' }],
      ['npm', { source: 'npm', package: 'p' }],
    ])('throws "not yet supported" for %s', async (kind, source) => {
      await expect(resolver.resolve(source as PluginObjectSource, dir)).rejects.toThrow(
        new RegExp(`Plugin source kind "${kind}" \\(.*\\) is not yet supported`),
      );
    });
  });

  describe('readPluginManifest', () => {
    describe('when plugin.json is at the plugin root', () => {
      it('reads it', async () => {
        await writeFile(
          join(dir, 'plugin.json'),
          JSON.stringify({ name: 'foo', version: '1.2.3' }),
        );
        expect(await resolver.readPluginManifest(dir)).toEqual({ name: 'foo', version: '1.2.3' });
      });
    });

    describe('when only .claude-plugin/plugin.json is present', () => {
      it('reads it as a fallback', async () => {
        await mkdir(join(dir, '.claude-plugin'), { recursive: true });
        await writeFile(
          join(dir, '.claude-plugin', 'plugin.json'),
          JSON.stringify({ name: 'bar' }),
        );
        expect(await resolver.readPluginManifest(dir)).toEqual({ name: 'bar' });
      });
    });

    describe('when no manifest is present', () => {
      it('returns {}', async () => {
        expect(await resolver.readPluginManifest(dir)).toEqual({});
      });
    });

    describe('when the manifest is unparseable', () => {
      it('returns {}', async () => {
        await writeFile(join(dir, 'plugin.json'), '{ not json');
        expect(await resolver.readPluginManifest(dir)).toEqual({});
      });
    });
  });
});

async function realDir(d: string): Promise<string> {
  const { realpath } = await import('node:fs/promises');
  return realpath(d);
}
