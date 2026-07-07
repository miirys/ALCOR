import { promises as fs } from 'node:fs';
import path from 'node:path';
import { sortBy } from 'lodash-es';
import { simpleGit } from 'simple-git';
import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import { isFileSchemeUri } from '@gitlab-org/fs';
import { RepositoryDiscoveryService } from './repository_service';
import { IGNORED_DIRECTORY_NAMES } from './common_paths';
import { StatelessRepository } from './stateless_repository';
import { DefaultStatelessRepository } from './default_stateless_repository';
import { findGitRepoRoot } from './find_git_repo_root';

const MAX_REPO_DEPTH = 2;

@Injectable(RepositoryDiscoveryService, [Logger])
export class StatelessRepositoryDiscoveryService implements RepositoryDiscoveryService {
  readonly #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[StatelessRepositoryDiscoveryService]');
  }

  async getMatchingRepository(
    filePath: string,
    workspacePath: string,
  ): Promise<StatelessRepository | undefined> {
    const repositories = await this.getRepositoriesForWorkspace(workspacePath);

    // This logic has been ported from DefaultRepositoryService.getMatchingRepositoryByDirectory
    // to ensure we return the most specific (deepest nested) repository
    let bestMatch: StatelessRepository | undefined;

    for (const repository of repositories) {
      const repositoryPath = repository.fsPath;
      if (filePath === repositoryPath || filePath.startsWith(repositoryPath + path.sep)) {
        if (repositoryPath.length > (bestMatch?.fsPath.length ?? 0)) {
          // Longer path means a more specific / nested repository was found.
          bestMatch = repository;
        }
      }
    }

    return bestMatch;
  }

  async getRepositoriesForWorkspace(workspacePath: string): Promise<StatelessRepository[]> {
    try {
      const dotGitFiles = await this.#findDotGitFiles(workspacePath);

      const validationPromises = dotGitFiles.map(async (dotGitFile) => {
        const repositoryPath = path.dirname(dotGitFile);
        const isValid = await this.#isValidRepository(repositoryPath);
        return { repositoryPath, isValid };
      });

      const validationResults = await Promise.all(validationPromises);

      const repositories = validationResults
        .filter(({ isValid }) => isValid)
        .map(({ repositoryPath }) => new DefaultStatelessRepository(repositoryPath));

      return sortBy(repositories, (r) => r.fsPath);
    } catch (error) {
      this.#logger.debug(`Failed to scan workspace ${workspacePath}`, error);
      return [];
    }
  }

  async getRepositoriesForWorkspaces(
    workspaceFolders: WorkspaceFolder[],
  ): Promise<Map<StatelessRepository, WorkspaceFolder>> {
    const result = new Map<StatelessRepository, WorkspaceFolder>();

    await Promise.all(
      workspaceFolders
        .filter((folder) => {
          if (!isFileSchemeUri(folder.uri)) {
            this.#logger.debug(`Skipping non-file workspace folder: ${folder.uri}`);
            return false;
          }
          return true;
        })
        .map(async (folder) => {
          const folderPath = URI.parse(folder.uri).fsPath;
          const repositories = await this.getRepositoriesForWorkspace(folderPath);
          for (const repo of repositories) {
            result.set(repo, folder);
          }
        }),
    );

    return result;
  }

  async findRepositoryRoot(directoryPath: string): Promise<string> {
    // Pure filesystem `.git` walk instead of `git rev-parse --show-toplevel`: an
    // out-of-repo git subprocess at startup can stall long enough to time out the
    // in-flight HTTP init, whereas a `stat`-based walk never spawns git.
    const repoRoot = await findGitRepoRoot(directoryPath);
    if (repoRoot === undefined) {
      const error = new Error(
        `Failed to find repository root for "${directoryPath}", is this a repository?`,
      );
      this.#logger.error(error.message, error);
      throw error;
    }
    // realpath to match `git rev-parse --show-toplevel`'s canonicalization.
    return fs.realpath(repoRoot);
  }

  async #findDotGitFiles(rootPath: string, currentDepth: number = 0): Promise<string[]> {
    try {
      const entries = await fs.readdir(rootPath, { withFileTypes: true });

      const directories = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
          name: entry.name,
          fullPath: path.join(rootPath, entry.name),
        }));

      // Get .git directories & files in current path
      const gitCandidates = entries
        .filter(({ name }) => name === '.git')
        .map(({ name }) => path.join(rootPath, name));

      // Stop recursing if we've reached the maximum depth
      if (currentDepth >= MAX_REPO_DEPTH) {
        return gitCandidates;
      }

      // Get subdirectories to recurse into (excluding .git and ignored directories)
      const subDirectories = directories
        .filter(({ name }) => name !== '.git' && !IGNORED_DIRECTORY_NAMES.includes(name))
        .map(({ fullPath }) => fullPath);

      // Process subdirectories in parallel and get their results
      const recursivePromises = subDirectories.map((subDir) =>
        this.#findDotGitFiles(subDir, currentDepth + 1),
      );
      const recursiveResults = await Promise.all(recursivePromises);

      return [...gitCandidates, ...recursiveResults.flat()];
    } catch (error) {
      this.#logger.debug(`Failed to read directory ${rootPath}`, error);
      return [];
    }
  }

  async #isValidRepository(repositoryPath: string): Promise<boolean> {
    try {
      const git = simpleGit(repositoryPath);
      return await git.checkIsRepo();
    } catch (error) {
      this.#logger.debug(`Invalid repository at ${repositoryPath}`, error);
      return false;
    }
  }
}
