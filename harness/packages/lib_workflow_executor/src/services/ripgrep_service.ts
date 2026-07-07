import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { join, relative } from 'node:path';
import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { GrepParams, GrepResult } from '@gitlab-org/repositories';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { rgPath as packagedRgPath } from '@vscode/ripgrep';
import { RG_BINARY_NAME } from './constants';
import { RgBinaryProvider } from './rg_binary_provider';

const execFileAsync = promisify(execFile);

/**
 * Resolve the rg binary to use:
 * - RgBinaryProvider: for CLI (Bun-embedded) and LS SEA builds (SEA-embedded)
 * - Bundled (IS_BUNDLED inlined as "true" by esbuild): rg is copied alongside the bundle
 *   by the extension build (common_jobs.mjs), so look next to __dirname.
 * - Watch mode / npm: packagedRgPath from @vscode/ripgrep exists on disk, use it.
 * - Fallback: system rg.
 */
async function resolveRgBinary(rgBinaryProvider: RgBinaryProvider): Promise<string> {
  // Try RgBinaryProvider first (for CLI and LS SEA builds)
  const extractedPath = await rgBinaryProvider.getPath();
  if (extractedPath) {
    return extractedPath;
  }

  // Try bundled path (for extension builds)
  if (process.env.IS_BUNDLED === 'true') {
    return join(__dirname, RG_BINARY_NAME);
  }

  // Try @vscode/ripgrep package (for dev/npm mode)
  if (existsSync(packagedRgPath)) {
    return packagedRgPath;
  }

  // Fallback to system rg
  return 'rg';
}

async function isRipgrepAvailable(rgBinary: string): Promise<boolean> {
  try {
    await execFileAsync(rgBinary, ['--version']);
    return true;
  } catch {
    return false;
  }
}

/** ripgrep exits with code 1 when there are no matches/files — not an error. */
function isNoMatchExitCode(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code: unknown }).code === 1
  );
}

export interface RipgrepService {
  grep(rootPath: string, params: GrepParams): Promise<GrepResult>;
  /**
   * Enumerate files under `rootPath`, optionally filtered by a glob `pattern`.
   * Returns paths relative to `rootPath`. Mirrors ripgrep defaults: inside a
   * git repository `.gitignore`d and hidden files are excluded; in a plain
   * directory everything is listed.
   */
  listFiles(rootPath: string, pattern?: string): Promise<string[]>;
  isAvailable(): Promise<boolean>;
}
export const RipgrepService = createInterfaceId<RipgrepService>('RipgrepService');

@Service({
  dependencies: [Logger, RgBinaryProvider],
  lifetime: ServiceLifetime.Singleton,
})
@Implements(RipgrepService)
export class DefaultRipgrepService implements RipgrepService {
  #rgBinary: Promise<string>;

  #available: Promise<boolean>;

  #logger: Logger;

  constructor(logger: Logger, rgBinaryProvider: RgBinaryProvider) {
    this.#logger = withPrefix(logger, '[RipgrepService]');
    this.#rgBinary = resolveRgBinary(rgBinaryProvider);
    this.#available = this.#rgBinary.then((binary) => {
      this.#logger.info(`rg binary resolved to "${binary}", exists=${existsSync(binary)}`);
      return isRipgrepAvailable(binary);
    });
    this.#available
      .then((available) => this.#logger.info(`rg available: ${available}`))
      .catch(() => {});
  }

  isAvailable(): Promise<boolean> {
    return this.#available;
  }

  async grep(rootPath: string, params: GrepParams): Promise<GrepResult> {
    const rgBinary = await this.#rgBinary;
    const args: string[] = ['--no-heading', '--line-number', '--with-filename', '--no-messages'];

    if (params.caseInsensitive) {
      args.push('-i');
    }
    if (params.maxCountFile !== undefined) {
      args.push(`--max-count=${params.maxCountFile}`);
    }

    const searchTerms = Array.isArray(params.searchQuery)
      ? params.searchQuery
      : [params.searchQuery];
    for (const term of searchTerms) {
      args.push('-e', term);
    }

    args.push('--', join(rootPath, params.searchDirectory));

    let stdout: string;
    try {
      const result = await execFileAsync(rgBinary, args);
      stdout = result.stdout;
    } catch (error: unknown) {
      if (isNoMatchExitCode(error)) {
        return { paths: new Set(), results: {} };
      }
      throw new Error(`ripgrep failed: ${error}`, { cause: error });
    }

    return this.#parseOutput(stdout, rootPath);
  }

  async listFiles(rootPath: string, pattern?: string): Promise<string[]> {
    // `rg --files` respects .gitignore (inside a repo) but a `-g` whitelist glob
    // would OVERRIDE .gitignore and re-include ignored files. To keep .gitignore
    // protection while preserving ripgrep's recursive glob semantics, we list
    // the allowed (gitignore-respecting) set without a glob and intersect it
    // with the glob-matched set.
    const allowed = await this.#runFiles(rootPath);
    if (!pattern) {
      return allowed;
    }
    const matched = new Set(await this.#runFiles(rootPath, pattern));
    return allowed.filter((file) => matched.has(file));
  }

  async #runFiles(rootPath: string, pattern?: string): Promise<string[]> {
    const rgBinary = await this.#rgBinary;
    const args: string[] = ['--files'];
    if (pattern) {
      args.push('-g', pattern);
    }
    args.push('--', rootPath);

    let stdout: string;
    try {
      const result = await execFileAsync(rgBinary, args);
      stdout = result.stdout;
    } catch (error: unknown) {
      if (isNoMatchExitCode(error)) {
        return [];
      }
      throw new Error(`ripgrep failed: ${error}`, { cause: error });
    }

    return stdout
      .split('\n')
      .filter(Boolean)
      .map((absPath) => relative(rootPath, absPath));
  }

  #parseOutput(stdout: string, repoPath: string): GrepResult {
    const paths = new Set<string>();
    const results: GrepResult['results'] = {};

    for (const line of stdout.split('\n')) {
      if (line && line !== '--') {
        // ripgrep output: <path>:<line_number>:<preview> for matches
        // and <path>-<line_number>-<preview> for context lines
        const matchResult = line.match(/^(.+?)([:|-])(\d+)\2(.*)$/);
        if (matchResult) {
          const [, absFilePath, , lineNumStr, preview] = matchResult;
          if (absFilePath && lineNumStr) {
            const filePath = relative(repoPath, absFilePath);
            const lineNum = parseInt(lineNumStr, 10);
            paths.add(filePath);
            if (!results[filePath]) {
              results[filePath] = [];
            }
            results[filePath].push({ line: lineNum, path: filePath, preview });
          }
        }
      }
    }

    return { paths, results };
  }
}
