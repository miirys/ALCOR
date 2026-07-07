import { tryParseUrl } from '@gitlab-org/core';
import { StatelessRepository } from '../../stateless_repository';

// copied from the `gitlab-vscode-extension`: https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/blob/main/src/desktop/git/git_remote_parser.ts

/**
 * GitLabRemote represents a parsed git remote URL that could potentially point to a GitLab project.
 */
export interface GitLabRemote {
  host: string;
  /**
   * Namespace is the group(s) or user to whom the project belongs: https://docs.gitlab.com/api/projects/#get-a-single-project
   *
   * e.g. `gitlab-org/security` in the `gitlab-org/security/gitlab-vscode-extension` project
   */
  namespace: string;
  /**
   * Path is the "project slug": https://docs.gitlab.com/api/projects/#get-a-single-project
   *
   * e.g. `gitlab-vscode-extension` in the `gitlab-org/gitlab-vscode-extension` project
   */
  projectPath: string;
  /**
   * Namespace with path is the full project identifier: https://docs.gitlab.com/api/projects/#get-a-single-project
   *
   * e.g. `gitlab-org/gitlab-vscode-extension`
   */
  namespaceWithPath: string;
}

// returns path without the trailing slash or empty string if there is no path
const getInstancePath = (instanceUrl: string) => {
  const { pathname } = tryParseUrl(instanceUrl) || {};
  return pathname ? pathname.replace(/\/$/, '') : '';
};

const escapeForRegExp = (str: string) => str.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');

function normalizeSshRemote(remote: string): string {
  // Regex to match bracketed git SSH remotes with custom port.
  // Example: [git@dev.company.com:7999]:group/repo_name.git
  // For more information see:
  // https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/309
  const sshRemoteWithCustomPort = remote.match(`^\\[([a-zA-Z0-9_-]+@.*?):(\\d+)\\]:(.*)$`);
  if (sshRemoteWithCustomPort) {
    return `ssh://${sshRemoteWithCustomPort[1]}:${sshRemoteWithCustomPort[2]}/${sshRemoteWithCustomPort[3]}`;
  }

  // Regex to match git SSH remotes with URL scheme and a custom port
  // Example: ssh://git@example.com:2222/fatihacet/gitlab-vscode-extension.git
  // For more information see:
  // https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/644
  const sshRemoteWithSchemeAndCustomPort = remote.match(`^ssh://([a-zA-Z0-9_-]+@.*?):(\\d+)(.*)$`);
  if (sshRemoteWithSchemeAndCustomPort) {
    return `ssh://${sshRemoteWithSchemeAndCustomPort[1]}:${sshRemoteWithSchemeAndCustomPort[2]}${sshRemoteWithSchemeAndCustomPort[3]}`;
  }

  // Regex to match git SSH remotes with port in path format: git@host:port/path
  // This handles cases like git@gdk.test:3000/gitlab-duo/test.git
  const sshRemoteWithPortInPath = remote.match(`([a-zA-Z0-9_-]+@[^:]+):(\\d+)/(.*)$`);
  if (sshRemoteWithPortInPath) {
    return `ssh://${sshRemoteWithPortInPath[1]}:${sshRemoteWithPortInPath[2]}/${sshRemoteWithPortInPath[3]}`;
  }

  // Regex to match git SSH remotes without URL scheme and no custom port
  // Example: git@example.com:fatihacet/gitlab-vscode-extension.git
  // For more information see this comment:
  // https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/611#note_1154175809
  const sshRemoteWithPath = remote.match(`([a-zA-Z0-9_-]+@.*?):(.*)`);
  if (sshRemoteWithPath) {
    return `ssh://${sshRemoteWithPath[1]}/${sshRemoteWithPath[2]}`;
  }

  if (remote.match(`^[a-zA-Z0-9_-]+@`)) {
    // Regex to match gitlab potential starting names for ssh remotes.
    return `ssh://${remote}`;
  }
  return remote;
}

export async function tryParseRepositoryGitLabRemoteDetails(
  repository: StatelessRepository,
  gitlabInstanceUrl: string,
): Promise<GitLabRemote | undefined> {
  try {
    const remotes = await repository.listRemotes();
    const originRemote = remotes.find((r) => r.remote === 'origin') ?? remotes[0];

    if (!originRemote?.url) {
      return undefined;
    }

    return parseGitLabRemote(originRemote.url, gitlabInstanceUrl);
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse GitLab remotes from repository: ${errMessage}`);
  }
}

export function parseGitLabRemote(remote: string, instanceUrl: string): GitLabRemote | undefined {
  const { hostname, host, pathname } = tryParseUrl(normalizeSshRemote(remote)) || {};

  if (!host || !pathname) {
    return undefined;
  }

  // when user instance does not match git remote
  // we do not know if it is GitLab's instance or not
  // because we run further checks agains the user instance URL (e.g. Duo Access check)
  // it makes sense to filter out remotes that do not belong to the user instance
  const isSameGitLabInstance = hostname === tryParseUrl(normalizeSshRemote(instanceUrl))?.hostname;

  if (!isSameGitLabInstance) {
    return undefined;
  }

  // The instance url might have a custom route, i.e. www.company.com/gitlab. This route is
  // optional in the remote url. This regex extracts namespace and project from the remote
  // url while ignoring any custom route, if present. For more information see:
  // - https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/merge_requests/11
  // - https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/103
  const pathRegExp =
    instanceUrl || instanceUrl.trim() !== '' ? escapeForRegExp(getInstancePath(instanceUrl)) : '';
  const match = pathname.match(`(?:${pathRegExp})?/:?(.+)/([^/]+?)(?:.git)?/?$`);
  if (!match) {
    return undefined;
  }

  const [namespace, projectPath] = match.slice(1, 3);
  if (!namespace || !projectPath) {
    return undefined;
  }
  const namespaceWithPath = `${namespace}/${projectPath}`;

  return {
    host,
    namespace,
    projectPath,
    namespaceWithPath,
  };
}
