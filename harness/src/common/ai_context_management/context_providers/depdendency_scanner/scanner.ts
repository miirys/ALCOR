import { createInterfaceId, Injectable } from '@gitlab/needle';
import { WorkspaceFolder } from 'vscode-languageserver';
import { RepositoryFile, RepositoryService, Repository } from '@gitlab-org/repositories';
import { FsClient } from '../../../services/fs/fs';
import { DuoProjectAccessChecker } from '../../../services/duo_access';
import { DuoProjectStatus } from '../../../services/duo_access/project_access_checker';
import { log } from '../../../log';
import { parseDependencyFile } from './parser';
import { DEPENDENCY_TYPES, DependencyType, ParsedDependency } from './types';

export interface DependencyScanner extends DefaultDependencyScanner {}

export const DependencyScanner = createInterfaceId<DependencyScanner>('DependencyScanner');

@Injectable(DependencyScanner, [RepositoryService, DuoProjectAccessChecker, FsClient])
export class DefaultDependencyScanner implements DependencyScanner {
  #repositoryService: RepositoryService;

  #projectAccessChecker: DuoProjectAccessChecker;

  #fsClient: FsClient;

  constructor(
    repositoryService: RepositoryService,
    projectAccessChecker: DuoProjectAccessChecker,
    fsClient: FsClient,
  ) {
    this.#repositoryService = repositoryService;
    this.#projectAccessChecker = projectAccessChecker;
    this.#fsClient = fsClient;
  }

  dependencyFileType(file: RepositoryFile): DependencyType | undefined {
    return DEPENDENCY_TYPES.find((type) => {
      return file.uri.path.match(`${type.fileName}$`) ? type : false;
    });
  }

  async findDependencies(repo: Repository, folder: WorkspaceFolder): Promise<ParsedDependency[]> {
    const repositoryFiles = this.#repositoryService.getCurrentFilesForRepository(
      repo.uri,
      folder.uri,
      {
        excludeGitFolder: true,
        excludeIgnored: true,
      },
    );

    const dependencyPromises = repositoryFiles.map(async (file) => {
      const { status } = this.#projectAccessChecker.checkProjectStatus(
        file.uri.toString(),
        file.workspaceFolder,
      );
      if (status !== DuoProjectStatus.DuoDisabled) {
        const type = this.dependencyFileType(file);
        if (type) {
          try {
            const { readFile } = this.#fsClient.promises;
            const content = readFile(file.uri.fsPath).then((buffer) => buffer.toString('utf-8'));
            const parsedDeps = await parseDependencyFile(type, content);
            return { type, libs: parsedDeps, fileUri: file.uri } as ParsedDependency;
          } catch {
            // FIXME: process the error
            log.error(`Error parsing dependency file ${file.uri.toString()}`);
          }
        }
      }
      return null;
    });

    const results = await Promise.all(dependencyPromises);
    return results.filter((result): result is ParsedDependency => result !== null);
  }
}
