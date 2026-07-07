import path from 'path';
import { gql } from 'graphql-request';
import ini from 'ini';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import {
  ApiRequest,
  EventEmitterImpl,
  ifVersionGte,
  versionRequest,
  diffEmitter,
} from '@gitlab-org/core';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import {
  VirtualFileSystemEvents,
  VirtualFileSystemService,
  WorkspaceFilesUpdate,
  isFileSchemeUri,
} from '@gitlab-org/fs';
import { ConfigService, VirtualWorkspaceProjectInfo } from '@gitlab-org/config';
import { GitLabRemote, parseGitLabRemote, GitConfigCommand } from '@gitlab-org/repositories';
import { GitLabApiClient } from '../../api';
import { log } from '../../log';
import { FsClient } from '../fs/fs';

/**
 * DuoProject is a representation of a Gitlab project with Duo features enabled.
 * the resulting data can look like this:
 * [
 *   {
 *     namespaceWithPath: 'path/to/project',
 *     uri: 'file:///path/to/project/.git/config',
 *     enabled: true,
 *   },
 *   {
 *     namespaceWithPath: 'path/to/project/nested',
 *     uri: 'file:///path/to/project/nested/.git/config',
 *     enabled: false,
 *   },
 * ];
 */
export type DuoProject = GitLabRemote & {
  /**
   * This is the pointer on the file system to the project.
   * eg. file:///User/username/gitlab-development-kit/gitlab/.git/config
   * This should match the `DocumentUri` of the document to check.
   *
   * @reference `DocumentUri` is the URI of the document to check. Comes from
   * the `TextDocument` object.
   */
  uri: string;
  /**
   * enabled: true if the project has Duo features enabled
   */
  enabled: boolean;
  /**
   * exclusionRules: array of exclusion rules for Duo context
   */
  exclusionRules: string[];
  /**
   * e.g. origin, security
   * */
  remoteName: string;
};

type WorkspaceFolderUri = string;

const duoProjectInfoQuery = gql`
  query GetProjectDuoInfo($projectPath: ID!) {
    project(fullPath: $projectPath) {
      duoFeaturesEnabled
    }
  }
`;

const duoProjectInfoWithContentExclusionQuery = gql`
  query GetProjectDuoInfo($projectPath: ID!) {
    project(fullPath: $projectPath) {
      duoFeaturesEnabled
      duoContextExclusionSettings {
        exclusionRules
      }
    }
  }
`;

interface GitConfig {
  [section: string]: { [key: string]: string };
}

type GitRemote = { name: string; url: string };

type WorkspaceGitLabRemote = GitLabRemote & {
  remoteName: string;
  fileUri: string;
};
export interface GqlProjectWithDuoInfo {
  duoFeaturesEnabled: boolean;
  duoContextExclusionSettings: {
    exclusionRules: string[];
  } | null;
}

export interface DuoWorkspaceProjectAccessCache extends DefaultDuoWorkspaceProjectAccessCache {}

export const DuoWorkspaceProjectAccessCache = createInterfaceId<DuoWorkspaceProjectAccessCache>(
  'DuoWorkspaceProjectAccessCache',
);

@Injectable(DuoWorkspaceProjectAccessCache, [
  FsClient,
  GitLabApiClient,
  VirtualFileSystemService,
  ConfigService,
  GitConfigCommand,
])
export class DefaultDuoWorkspaceProjectAccessCache {
  #duoProjects: Map<WorkspaceFolderUri, DuoProject[]>;

  #eventEmitter = diffEmitter(new EventEmitterImpl<Map<WorkspaceFolderUri, DuoProject[]>>());

  #fsClient: FsClient;

  #api: GitLabApiClient;

  #virtualFileSystemService: VirtualFileSystemService;

  #configService: ConfigService;

  #gitConfigCommand: GitConfigCommand;

  #lastWorkspaceFilesUpdates: Map<WorkspaceFolderUri, WorkspaceFilesUpdate>;

  #isDuoDisabledBeforeState: boolean;

  constructor(
    fsClient: FsClient,
    api: GitLabApiClient,
    virtualFileSystemService: VirtualFileSystemService,
    configService: ConfigService,
    gitConfigCommand: GitConfigCommand,
  ) {
    this.#fsClient = fsClient;
    this.#api = api;
    this.#virtualFileSystemService = virtualFileSystemService;
    this.#configService = configService;
    this.#gitConfigCommand = gitConfigCommand;
    this.#duoProjects = new Map<WorkspaceFolderUri, DuoProject[]>();
    this.#lastWorkspaceFilesUpdates = new Map<WorkspaceFolderUri, WorkspaceFilesUpdate>();
    this.#isDuoDisabledBeforeState = this.#allDuoFeaturesDisabled();
    this.#virtualFileSystemService.onFileSystemEvent(async (eventType, data) => {
      if (eventType === VirtualFileSystemEvents.WorkspaceFilesEvent) {
        const update = data as WorkspaceFilesUpdate;
        this.#lastWorkspaceFilesUpdates.set(update.workspaceFolder.uri, update);
        await this.#updateCache({
          baseUrl: this.#configService.get('baseUrl') ?? '',
          workspaceFilesUpdate: update,
        });
      }
    });

    this.#configService.onConfigChange(async () => {
      this.#pruneRemovedWorkspaceFolders();
      const allDisabled = this.#allDuoFeaturesDisabled();
      if (allDisabled !== this.#isDuoDisabledBeforeState) {
        this.#isDuoDisabledBeforeState = allDisabled;
        if (allDisabled) {
          log.debug(
            'DuoProjectAccessCache: All Duo features disabled via config change, clearing project cache',
          );
          this.#duoProjects.clear();
          this.#triggerChange();
        } else {
          log.debug(
            'DuoProjectAccessCache: Duo features re-enabled via config change, refreshing project cache',
          );
          await this.#refreshAllWorkspaceFolders();
        }
      }
    });
  }

  #pruneRemovedWorkspaceFolders() {
    const workspaceFolders = this.#configService.get('workspaceFolders');
    // Only prune when the config explicitly reports a folder set; an undefined
    // config means the IDE hasn't pushed workspace folders yet (or this code
    // path is being driven in isolation by a test) and we have nothing to diff.
    if (!workspaceFolders) return;

    const currentUris = new Set(workspaceFolders.map((f) => f.uri));
    let pruned = false;
    for (const uri of this.#lastWorkspaceFilesUpdates.keys()) {
      if (!currentUris.has(uri)) {
        this.#lastWorkspaceFilesUpdates.delete(uri);
        this.#duoProjects.delete(uri);
        pruned = true;
      }
    }
    if (pruned) this.#triggerChange();
  }

  #allDuoFeaturesDisabled(): boolean {
    const isCodeCompletionEnabled = this.#configService.get('codeCompletion.enabled');
    const isDuoChatEnabled = this.#configService.get('duoChat.enabled');
    const isAgentPlatformEnabled = this.#configService.get('duo.agentPlatform.enabled');
    return !isCodeCompletionEnabled && !isDuoChatEnabled && !isAgentPlatformEnabled;
  }

  async #refreshAllWorkspaceFolders() {
    await Promise.all(
      [...this.#lastWorkspaceFilesUpdates.values()].map((update) =>
        this.#updateCache({
          baseUrl: this.#configService.get('baseUrl') ?? '',
          workspaceFilesUpdate: update,
        }),
      ),
    );
  }

  getProjectsForWorkspaceFolder(workspaceFolder: WorkspaceFolder): DuoProject[] {
    return this.#duoProjects.get(workspaceFolder.uri) ?? [];
  }

  async #updateCache({
    baseUrl,
    workspaceFilesUpdate,
  }: {
    baseUrl: string;
    workspaceFilesUpdate: WorkspaceFilesUpdate;
  }) {
    try {
      // If all Duo features are disabled, skip project scanning entirely
      if (this.#allDuoFeaturesDisabled()) {
        log.debug(
          'DuoProjectAccessCache: All GitLab Duo features (code completion, Chat, Agent Platform) are disabled, skipping project access cache update',
        );
        this.#duoProjects.delete(workspaceFilesUpdate.workspaceFolder.uri);
        this.#triggerChange();
        return;
      }

      this.#duoProjects.delete(workspaceFilesUpdate.workspaceFolder.uri);

      const projects = await this.#duoProjectsForWorkspaceFolder({
        workspaceFilesUpdate,
        baseUrl,
      });

      this.#logProjectsInfo(projects, workspaceFilesUpdate.workspaceFolder);
      this.#duoProjects.set(workspaceFilesUpdate.workspaceFolder.uri, projects);
      this.#triggerChange();
    } catch (err) {
      log.error('DuoWorkspaceProjectAccessCache: failed to update project access cache', err);
    }
  }

  #logProjectsInfo(projects: DuoProject[], workspaceFolder: WorkspaceFolder) {
    if (!projects.length) {
      log.warn(
        `DuoProjectAccessCache: no projects found for workspace folder ${workspaceFolder.uri}`,
      );
      return;
    }
    log.debug(
      `DuoProjectAccessCache: found ${projects.length} projects for workspace folder ${workspaceFolder.uri}: ${JSON.stringify(projects, null, 2)}`,
    );
  }

  async #duoProjectsForWorkspaceFolder({
    workspaceFilesUpdate,
    baseUrl,
  }: {
    workspaceFilesUpdate: WorkspaceFilesUpdate;
    baseUrl: string;
  }): Promise<DuoProject[]> {
    if (!isFileSchemeUri(workspaceFilesUpdate.workspaceFolder.uri)) {
      return this.#duoProjectsForVirtualWorkspace(workspaceFilesUpdate.workspaceFolder, baseUrl);
    }

    const remotes = await this.#gitlabRemotesForWorkspaceFolder(workspaceFilesUpdate, baseUrl);
    const projects = await Promise.all(
      remotes.map(async (remote) => {
        const { enabled, exclusionRules } = await this.#checkDuoProjectInfo(
          remote.namespaceWithPath,
        );
        return {
          projectPath: remote.projectPath,
          uri: remote.fileUri,
          enabled,
          exclusionRules,
          host: remote.host,
          namespace: remote.namespace,
          namespaceWithPath: remote.namespaceWithPath,
          remoteName: remote.remoteName,
        } satisfies DuoProject;
      }),
    );
    return projects;
  }

  async #duoProjectsForVirtualWorkspace(
    workspaceFolder: WorkspaceFolder,
    baseUrl: string,
  ): Promise<DuoProject[]> {
    const virtualProjects: VirtualWorkspaceProjectInfo[] =
      this.#configService.get('virtualWorkspaceProjects') ?? [];

    const match = virtualProjects.find((vp) => vp.workspaceFolderUri === workspaceFolder.uri);

    if (!match) {
      log.debug(
        `DuoProjectAccessCache: no virtualWorkspaceProjects config for virtual workspace ${workspaceFolder.uri}`,
      );
      return [];
    }

    const { host } = new URL(baseUrl);
    const projectPath = match.projectPath.split('/').pop() ?? match.projectPath;
    const namespace = match.projectPath.includes('/')
      ? match.projectPath.substring(0, match.projectPath.lastIndexOf('/'))
      : '';
    const remoteName = match.remoteName ?? 'origin';

    const { enabled, exclusionRules } = await this.#checkDuoProjectInfo(match.projectPath);

    return [
      {
        projectPath,
        uri: workspaceFolder.uri,
        enabled,
        exclusionRules,
        host,
        namespace,
        namespaceWithPath: match.projectPath,
        remoteName,
      } satisfies DuoProject,
    ];
  }

  async #gitlabRemotesForWorkspaceFolder(
    workspaceFilesUpdate: WorkspaceFilesUpdate,
    baseUrl: string,
  ): Promise<WorkspaceGitLabRemote[]> {
    const gitConfigUris = workspaceFilesUpdate.files
      .map((file) => file)
      .filter((uri) => uri.toString().endsWith('/.git/config'));
    const remotes = await Promise.all(
      gitConfigUris.map(async (fileUri) => this.#gitlabRemotesForFileUri(fileUri, baseUrl)),
    );
    return remotes.flat();
  }

  async #gitlabRemotesForFileUri(fileUri: URI, baseUrl: string): Promise<WorkspaceGitLabRemote[]> {
    const remotes = await this.#remotesFromGitConfig(fileUri);
    const resolved = await Promise.all(
      remotes.map(async (remote) => {
        const resolvedUrl = await this.#gitConfigCommand.getRemoteUrl(
          fileUri,
          remote.name,
          remote.url,
        );

        const parsedRemote = parseGitLabRemote(resolvedUrl, baseUrl);

        if (parsedRemote) {
          return {
            ...parsedRemote,
            remoteName: remote.name,
            fileUri: fileUri.toString(),
          };
        }
        return null;
      }),
    );

    return resolved.filter((r): r is WorkspaceGitLabRemote => r !== null);
  }

  async #remotesFromGitConfig(fileUri: URI): Promise<GitRemote[]> {
    try {
      const { readFile } = this.#fsClient.promises;
      const fileString = (await readFile(fileUri.fsPath)).toString('utf-8');
      const config = ini.parse(fileString);
      return this.#getRemotes(config);
    } catch (error) {
      log.error(`DuoProjectAccessCache: Failed to read git config file: ${fileUri}`, error);
      return [];
    }
  }

  #getRemotes(config: GitConfig): GitRemote[] {
    const remotes: GitRemote[] = [];

    Object.keys(config).forEach((key) => {
      if (key.startsWith('remote ')) {
        let remoteName: string | undefined;

        const quotedMatch = key.match(/^remote "(.+)"$/);
        if (quotedMatch) {
          [, remoteName] = quotedMatch;
        } else {
          const unquotedMatch = key.match(/^remote (\S+)$/);
          if (unquotedMatch) {
            [, remoteName] = unquotedMatch;
          }
        }

        if (remoteName && config[key].url) {
          remotes.push({
            name: remoteName,
            url: config[key].url,
          });
        }
      }
    });

    return remotes;
  }

  async #checkDuoProjectInfo(
    projectPath: string,
  ): Promise<{ enabled: boolean; exclusionRules: string[] }> {
    try {
      const { version } = await this.#api.fetchFromApi(versionRequest);

      let query = '';
      ifVersionGte(
        version,
        '18.2.0',
        () => {
          query = duoProjectInfoWithContentExclusionQuery;
        },
        () => {
          query = duoProjectInfoQuery;
        },
      );

      const response = await this.#api.fetchFromApi<{ project: GqlProjectWithDuoInfo }>({
        type: 'graphql',
        query,
        variables: {
          projectPath,
        },
      } satisfies ApiRequest<{ project: GqlProjectWithDuoInfo }>);

      const project = response?.project;
      return {
        enabled: Boolean(project?.duoFeaturesEnabled),
        exclusionRules: project?.duoContextExclusionSettings?.exclusionRules ?? [],
      };
    } catch (error) {
      log.error(
        `DuoProjectAccessCache: Failed to check Duo project info for project: ${projectPath}`,
        error,
      );
      return {
        enabled: true,
        exclusionRules: [],
      };
    }
  }

  onDuoProjectCacheUpdate = this.#eventEmitter.event;

  #triggerChange() {
    this.#eventEmitter.fire(this.#duoProjects);
  }

  getProjectFSPathFromUri(uri: string): string {
    // Convert file:///path/to/project/.git/config to /path/to/project
    // On Windows: file:///C:/path/to/project/.git/config to C:\path\to\project
    const parsedUri = URI.parse(uri);
    const { fsPath } = parsedUri;

    // Remove /.git/config or \.git\config from the end (platform-specific)
    const gitConfigSuffix = `${path.sep}.git${path.sep}config`;
    return fsPath.endsWith(gitConfigSuffix) ? fsPath.slice(0, -gitConfigSuffix.length) : fsPath;
  }
}
