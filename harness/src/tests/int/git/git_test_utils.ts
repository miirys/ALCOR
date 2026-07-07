import { exec } from 'child_process';
import path, { basename, dirname } from 'path';
import { promisify } from 'util';
import { readFile, writeFile } from 'fs/promises';
import { setTimeout } from 'timers/promises';
import { mkdir } from 'fs-extra';
import { rimraf } from 'rimraf';
import { fdir as Fdir } from 'fdir';
import { URI } from 'vscode-uri';
import { GitSubmodule } from '@gitlab-org/repositories';
import { log } from '../../../common/log';

const testLog = {
  info: (message: string) => {
    log.info(`[GIT INTEGRATION TEST] ${message}`);
  },
};

// FIXME: replace with `execa`. This cannot be done without handling ESM modules
// in our Jest config: https://jestjs.io/docs/ecmascript-modules
const asyncExec = promisify(exec);

export const assertEventually = async ({
  assertion,
  timeout = 10000,
  interval = 200,
}: {
  assertion: () => void;
  timeout?: number;
  interval?: number;
}) => {
  const startTime = Date.now();
  let lastError;
  while (Date.now() - startTime < timeout) {
    try {
      // eslint-disable-next-line no-await-in-loop, @typescript-eslint/return-await
      return await assertion();
    } catch (error) {
      lastError = error;
      // eslint-disable-next-line no-await-in-loop
      await setTimeout(interval);
    }
  }
  throw lastError;
};

export type TestRepo = {
  url: string;
  dir: string;
  treeFiles: Set<string>;
  gitIgnoreTestFiles: {
    gitIgnoreFilePath: string;
    testIgnoredFilePath: string;
  }[];
};

export type TestFile = {
  filePath: string;
  content: string;
};

const tmpDir = path.join(process.cwd(), 'tmp');
const treesDir = path.join(tmpDir, 'trees');
const gdkDir = path.join(tmpDir, 'gitlab-development-kit');

export const testingPaths = {
  tmpDir,
  treesDir,
  gdkDir,
};

export const removeTmpDir = async () => {
  testLog.info(`Removing ${tmpDir}`);
  await rimraf(tmpDir);
};

/**
 * To avoid false positives, we add a custom ignore pattern to gitignore
 * files in the RepositoryService tests.
 *
 * We do this to verify we're not only comparing the "cloned tree"
 * but also the "current state" of the repository (eg. after changes).
 */
const setupGitignoreSampleData = async (repo: TestRepo) => {
  const gitignoreFiles = await new Fdir()
    .withFullPaths()
    .filter((file) => basename(file) === '.gitignore')
    .crawl(repo.dir)
    .withPromise();
  testLog.info(`Found ${gitignoreFiles.length} .gitignore files`);
  // add a pattern to ignore files
  const gitIgnoreTestFiles = await Promise.all(
    gitignoreFiles.map(async (gitIgnoreFilePath) => {
      const fileContents = await readFile(gitIgnoreFilePath, 'utf8');
      await writeFile(gitIgnoreFilePath, fileContents.concat('\nGITLAB_LSP_TEST/*.txt\n'));
      const testIgnoredFilePath = path.join(
        dirname(gitIgnoreFilePath),
        'GITLAB_LSP_TEST',
        `${Math.floor(Math.random() * 1000) + 1}.txt`,
      );
      await mkdir(dirname(testIgnoredFilePath), { recursive: true });
      await writeFile(testIgnoredFilePath, 'never gonna give you up');
      return {
        gitIgnoreFilePath,
        testIgnoredFilePath,
      };
    }),
  );

  return gitIgnoreTestFiles;
};

const populateRepository = async (repo: TestRepo): Promise<TestRepo> => {
  const repoName = path.basename(repo.url, '.git');
  const testFiles = await setupGitignoreSampleData(repo);

  await mkdir(treesDir, { recursive: true });

  repo.gitIgnoreTestFiles.push(...testFiles);

  testLog.info(`Getting tree files for ${repoName}...`);
  await asyncExec(
    `git ls-tree -r --name-only HEAD >> ${path.join(treesDir, `tree_${repoName}.txt`)}`,
    { cwd: repo.dir },
  );
  const gitLsTreeOutput = await readFile(path.join(treesDir, `tree_${repoName}.txt`), 'utf-8');
  for (const file of gitLsTreeOutput.split('\n').filter(Boolean)) {
    repo.treeFiles.add(file);
  }
  testLog.info(`Setup test repository for ${repoName} ✅`);
  return repo;
};

export const createGitRepository = async (
  repo: TestRepo,
  files: TestFile[] = [],
): Promise<TestRepo> => {
  await mkdir(repo.dir, { recursive: true });

  await asyncExec(`git init ${repo.dir}`);
  await asyncExec(`git config user.email "test@example.com"`, { cwd: repo.dir });
  await asyncExec(`git config user.name "Test"`, { cwd: repo.dir });

  // Create files sequentially to avoid git index.lock conflicts
  for (const file of files) {
    const fullPath = path.join(repo.dir, file.filePath);
    // eslint-disable-next-line no-await-in-loop
    await mkdir(dirname(fullPath), { recursive: true });
    // eslint-disable-next-line no-await-in-loop
    await writeFile(fullPath, file.content);
    // eslint-disable-next-line no-await-in-loop
    await asyncExec(`git add ${file.filePath}`, { cwd: repo.dir });
  }

  await asyncExec(`git commit -m "Initial commit"`, { cwd: repo.dir });

  return populateRepository(repo);
};

const setupTestRepository = async (repo: TestRepo): Promise<TestRepo> => {
  testLog.info(`Cloning ${repo.url}...`);
  await asyncExec(`git clone --depth 1 ${repo.url} ${repo.dir}`);

  return populateRepository(repo);
};

export const setupTestRepos = async (testRepos: TestRepo[]): Promise<TestRepo[]> => {
  await removeTmpDir();

  await mkdir(tmpDir, { recursive: true });
  await mkdir(gdkDir, { recursive: true });

  const repos: TestRepo[] = [];
  for (const repo of testRepos) {
    // eslint-disable-next-line no-await-in-loop
    const setupRepo = await setupTestRepository(repo);
    repos.push(setupRepo);
  }

  testLog.info(`Setup ${testRepos.length} test repositories ✅`);
  return repos;
};

const compareFileSets = (setA: Set<string>, setB: Set<string>) => {
  return new Set([...setA].filter((x) => !setB.has(x)));
};

/**
 * Compare the files in the repository using git ls-tree and the RepositoryService
 *
 * This takes the current "state" of the repository as seen by `git ls-tree`
 * and compares it to the files returned by the RepositoryService.
 *
 * We use this to validate that the RepositoryService is working correctly
 * and to detect regressions.
 */
export const compareRepoFiles = (
  repo: TestRepo,
  serviceFileUris: URI[],
  submodules: GitSubmodule[],
) => {
  const serviceFileSet = new Set(
    serviceFileUris.map((file) => {
      const relativePath = path.relative(repo.dir, file.fsPath);

      return replaceAll(path.normalize(relativePath), path.sep, path.posix.sep);
    }),
  );

  // Remove submodules from the tree files from the `git ls-tree` output.
  // This is because the `DirectoryWalker` (see `dir.ts`) will not return
  // folders in it's output (which a submodule folder is the represented as a directory on the file system).
  // Client consumers can use `RepositoryService.getSubmodulesForRepository`
  // to get the submodules for a repository.
  const treeFilesMinusSubmodules = new Set(
    [...repo.treeFiles].filter((file) => !submodules.some((sub) => file.startsWith(sub.path))),
  );

  const missingInService = compareFileSets(treeFilesMinusSubmodules, serviceFileSet);
  const extraInService = compareFileSets(serviceFileSet, treeFilesMinusSubmodules);

  return { missingInService, extraInService, repo };
};

// TODO: use built in string method from ECMAScript 2021
function replaceAll(targetString: string, find: string, replace: string): string {
  return targetString.split(find).join(replace);
}
