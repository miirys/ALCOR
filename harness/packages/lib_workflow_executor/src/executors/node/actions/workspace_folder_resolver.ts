import { resolve } from 'node:path';
import { isFileSchemeUri, workspaceFolderPathFromUri } from '@gitlab-org/fs';
import { isPathContainedIn } from './utils/path_containment';

export interface ContainingWorkspaceFolder {
  path: string;
  uri: string;
}

/**
 * Finds the configured workspace folder that contains `absPath`, so an absolute read
 * (e.g. an agent skill location) resolves against the skill's own folder rather than
 * only the active one. Returns undefined when the path is outside every folder, in
 * which case the caller falls back to the trusted-directory reader.
 */
export async function findContainingWorkspaceFolder(
  absPath: string,
  workspaceFolders: readonly { uri: string }[],
  realPath: (p: string) => Promise<string>,
): Promise<ContainingWorkspaceFolder | undefined> {
  const realTarget = (await realPath(absPath)) || resolve(absPath);

  const candidates = await Promise.all(
    workspaceFolders
      .filter((wsf) => Boolean(wsf.uri) && isFileSchemeUri(wsf.uri))
      .map(async (wsf) => {
        const path = workspaceFolderPathFromUri(wsf.uri);
        const realWs = (await realPath(path)) || resolve(path);
        return { path, uri: wsf.uri, realWs };
      }),
  );

  const match = candidates.find(({ realWs }) => isPathContainedIn(realWs, realTarget));

  return match ? { path: match.path, uri: match.uri } : undefined;
}
