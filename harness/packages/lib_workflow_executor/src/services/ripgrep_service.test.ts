import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { rgPath as packagedRgPath } from '@vscode/ripgrep';
import { writeArchive, parse } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { DefaultRipgrepService, RipgrepService } from './ripgrep_service';
import { NullRgBinaryProvider } from './null_rg_binary_provider';

function isBinaryAvailableSync(binary: string): boolean {
  try {
    execFileSync(binary, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const ripgrepAvailable = isBinaryAvailableSync(packagedRgPath) || isBinaryAvailableSync('rg');
const describeIfRg = ripgrepAvailable ? describe : describe.skip;
const describeIfNoRg = ripgrepAvailable ? describe.skip : describe;

describe('DefaultRipgrepService', () => {
  let service: RipgrepService;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'ripgrep-test-'));

    await writeArchive(
      tempDir,
      parse(
        `
-- src/main.ts --
export function searchPattern() {
  const searchPattern = true;
  return searchPattern;
}
-- src/utils.ts --
export function SearchPattern() {
  return 'FOUND';
}
-- src/nested/helper.ts --
export function helper() {
  return 'no match here';
}
`,
      ),
    );
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  beforeEach(() => {
    service = new DefaultRipgrepService(new TestLogger(), new NullRgBinaryProvider());
  });

  describe('isAvailable', () => {
    describeIfRg('when rg is present in the environment', () => {
      it('returns true', async () => {
        await expect(service.isAvailable()).resolves.toBe(true);
      });
    });

    describeIfNoRg('when rg is not present in the environment', () => {
      it('returns false', async () => {
        await expect(service.isAvailable()).resolves.toBe(false);
      });
    });
  });

  describe('grep', () => {
    describeIfRg('when ripgrep is available', () => {
      it('finds matches in files', async () => {
        const result = await service.grep(tempDir, {
          searchQuery: 'searchPattern',
          searchDirectory: 'src',
          caseInsensitive: false,
        });

        expect(result.paths.size).toBeGreaterThan(0);
        expect(result.paths).toContain('src/main.ts');

        const mainResults = result.results['src/main.ts'];
        expect(mainResults).toBeDefined();
        expect(mainResults!.length).toBeGreaterThan(0);
        expect(mainResults![0].preview).toContain('searchPattern');
      });

      describe('when case_insensitive is true', () => {
        it('finds case-insensitive matches', async () => {
          const result = await service.grep(tempDir, {
            searchQuery: 'searchpattern',
            searchDirectory: 'src',
            caseInsensitive: true,
          });

          expect(result.paths).toContain('src/main.ts');
          expect(result.paths).toContain('src/utils.ts');
        });
      });

      describe('when no matches are found', () => {
        it('returns empty results', async () => {
          const result = await service.grep(tempDir, {
            searchQuery: 'nonexistent_xyz_abc',
            searchDirectory: 'src',
            caseInsensitive: false,
          });

          expect(result.paths.size).toBe(0);
          expect(Object.keys(result.results)).toHaveLength(0);
        });
      });

      describe('when searching with multiple terms', () => {
        it('finds matches for all terms', async () => {
          const result = await service.grep(tempDir, {
            searchQuery: ['searchPattern', 'helper'],
            searchDirectory: 'src',
            caseInsensitive: false,
          });

          expect(result.paths).toContain('src/main.ts');
          expect(result.paths).toContain('src/nested/helper.ts');
        });
      });

      describe('when maxCountFile is set', () => {
        it('limits matches per file', async () => {
          const result = await service.grep(tempDir, {
            searchQuery: 'searchPattern',
            searchDirectory: 'src',
            caseInsensitive: false,
            maxCountFile: 1,
          });

          const mainResults = result.results['src/main.ts'];
          expect(mainResults).toBeDefined();
          expect(mainResults!.length).toBe(1);
        });
      });
    });

    describeIfNoRg('when ripgrep is not available', () => {
      it('throws an error', async () => {
        await expect(
          service.grep(tempDir, {
            searchQuery: 'searchPattern',
            searchDirectory: 'src',
            caseInsensitive: false,
          }),
        ).rejects.toThrow('ripgrep failed');
      });
    });
  });

  describe('listFiles', () => {
    describeIfRg('when ripgrep is available', () => {
      it('lists all files relative to the root', async () => {
        const files = await service.listFiles(tempDir);

        expect(files.sort()).toEqual(
          ['src/main.ts', 'src/utils.ts', 'src/nested/helper.ts'].sort(),
        );
      });

      it('filters by a glob pattern', async () => {
        const files = await service.listFiles(tempDir, 'helper.ts');

        expect(files).toEqual(['src/nested/helper.ts']);
      });

      it('returns an empty array when nothing matches', async () => {
        const files = await service.listFiles(tempDir, '*.does-not-exist');

        expect(files).toEqual([]);
      });
    });

    describeIfNoRg('when ripgrep is not available', () => {
      it('throws an error', async () => {
        await expect(service.listFiles(tempDir)).rejects.toThrow('ripgrep failed');
      });
    });
  });
});
