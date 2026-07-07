import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { RgBinaryProvider, RgEmbeddedBinaryPath } from './rg_binary_provider';

@Service({
  dependencies: [Logger, RgEmbeddedBinaryPath],
  lifetime: ServiceLifetime.Singleton,
})
@Implements(RgBinaryProvider)
export class DefaultRgBinaryProvider implements RgBinaryProvider {
  #logger: Logger;

  #embeddedPath: string;

  #extractedPath: string | null = null;

  constructor(logger: Logger, embeddedPath: string) {
    this.#logger = withPrefix(logger, '[RgBinaryProvider]');
    this.#embeddedPath = embeddedPath;
  }

  async getPath(): Promise<string | null> {
    if (this.#extractedPath) {
      return this.#extractedPath;
    }

    try {
      this.#extractedPath = await this.#extractBinary();
      return this.#extractedPath;
    } catch (error) {
      this.#logger.error(
        'Failed to extract ripgrep binary',
        error instanceof Error ? error : new Error(String(error)),
      );
      return null;
    }
  }

  async #extractBinary(): Promise<string> {
    // Use Node fs to read the embedded file (works in both Bun and Node runtimes)
    const binaryData = readFileSync(this.#embeddedPath);

    const hash = createHash('sha256').update(binaryData).digest('hex').slice(0, 8);

    const binaryName = process.platform === 'win32' ? 'rg.exe' : 'rg';
    const extractDir = join(tmpdir(), 'gitlab-duo-cli', 'bin', hash);
    const extractedPath = join(extractDir, binaryName);

    if (existsSync(extractedPath)) {
      this.#logger.info(`rg already extracted at ${extractedPath}`);
      return extractedPath;
    }

    mkdirSync(extractDir, { recursive: true });

    // Write to temp file first, then atomically rename to avoid corrupted binary
    // if process is killed mid-write
    const tmpPath = `${extractedPath}.tmp.${process.pid}`;
    writeFileSync(tmpPath, binaryData);

    if (process.platform !== 'win32') {
      chmodSync(tmpPath, 0o755);
    }

    renameSync(tmpPath, extractedPath);

    this.#logger.info(`rg extracted to ${extractedPath}`);
    return extractedPath;
  }
}
