import { existsSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TestLogger } from '@gitlab-org/logging';
import { NullRgBinaryProvider } from './null_rg_binary_provider';
import { DefaultRgBinaryProvider } from './default_rg_binary_provider';

describe('NullRgBinaryProvider', () => {
  describe('getPath', () => {
    it('returns null', async () => {
      const provider = new NullRgBinaryProvider();
      await expect(provider.getPath()).resolves.toBeNull();
    });
  });
});

describe('DefaultRgBinaryProvider', () => {
  let embeddedBinaryPath: string;

  beforeEach(() => {
    // Create a fake binary file to use as the embedded path
    embeddedBinaryPath = join(tmpdir(), `fake-rg-${Date.now()}`);
    writeFileSync(embeddedBinaryPath, 'fake rg binary content');
  });

  describe('getPath', () => {
    describe('when called for the first time', () => {
      it('extracts the binary to a temp directory and returns the path', async () => {
        const provider = new DefaultRgBinaryProvider(new TestLogger(), embeddedBinaryPath);

        const result = await provider.getPath();

        expect(result).not.toBeNull();
        expect(existsSync(result!)).toBe(true);
      });

      it('returns a path inside the system temp directory', async () => {
        const provider = new DefaultRgBinaryProvider(new TestLogger(), embeddedBinaryPath);

        const result = await provider.getPath();

        expect(result).toContain(tmpdir());
        expect(result).toContain('gitlab-duo-cli');
        expect(result).toContain('bin');
      });

      it('makes the extracted file executable on non-windows', async () => {
        if (process.platform === 'win32') return;

        const provider = new DefaultRgBinaryProvider(new TestLogger(), embeddedBinaryPath);

        const result = await provider.getPath();

        // eslint-disable-next-line no-bitwise
        const isExecutable = (statSync(result!).mode & 0o111) !== 0;
        expect(isExecutable).toBe(true);
      });
    });

    describe('when called multiple times', () => {
      it('returns the same path without re-extracting', async () => {
        const provider = new DefaultRgBinaryProvider(new TestLogger(), embeddedBinaryPath);

        const first = await provider.getPath();
        const second = await provider.getPath();

        expect(first).toBe(second);
      });
    });

    describe('when the embedded path does not exist', () => {
      it('returns null and logs an error', async () => {
        const logger = new TestLogger();
        const provider = new DefaultRgBinaryProvider(logger, '/nonexistent/path/to/rg');

        const result = await provider.getPath();

        expect(result).toBeNull();
        expect(logger.errorLogs).toHaveLength(1);
      });
    });
  });
});

// SeaRgBinaryProvider was removed when the LS migrated from Node SEA to
// Bun-compiled binaries. Embedded ripgrep is now resolved via
// DefaultRgBinaryProvider + the per-target rg_binary_embed.ts shim.
