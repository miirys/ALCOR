import path from 'path';
import { URI } from 'vscode-uri';
import { GitSubmodule } from '@gitlab-org/repositories';
import { fsPathToUri } from '@gitlab-org/fs';

/**
 * Parse the content of a .gitmodules file
 * @param content String content of the .gitmodules file
 * @param repositoryUri URI of the parent repository
 * @param workspaceFolderUri URI of the workspace folder
 * @returns Array of `GitSubmodule` objects
 */
export const parseGitModulesContent = ({
  content,
  repositoryUri,
  workspaceFolderUri,
}: {
  content: string;
  repositoryUri: URI;
  workspaceFolderUri: URI;
}): GitSubmodule[] => {
  const submodules: GitSubmodule[] = [];
  const lines = content.split('\n');
  let currentSubmodule: {
    name: string;
    path?: string;
    url?: string;
    properties: Record<string, string>;
  } | null = null;

  const addSubmoduleIfComplete = (sub: typeof currentSubmodule) => {
    if (sub?.name && sub.path && sub.url) {
      const result: GitSubmodule = {
        name: sub.name,
        path: sub.path,
        filePath: fsPathToUri(path.join(workspaceFolderUri.fsPath, sub.path)),
        url: sub.url,
        repositoryUri,
        workspaceFolderUri,
      };

      const extraProps = { ...sub.properties };
      if (Object.keys(extraProps).length > 0) {
        result.properties = extraProps;
      }

      submodules.push(result);
      return true;
    }
    return false;
  };

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine) {
      if (trimmedLine.startsWith('[submodule "')) {
        addSubmoduleIfComplete(currentSubmodule);

        const name = trimmedLine.substring(
          trimmedLine.indexOf('"') + 1,
          trimmedLine.lastIndexOf('"'),
        );
        currentSubmodule = { name, properties: {} };
      } else if (currentSubmodule) {
        // Check for property assignments (key = value format)
        const propertyMatch = trimmedLine.match(/^(\w+)\s*=\s*(.+)$/);
        if (propertyMatch) {
          const [, key, value] = propertyMatch;
          const trimmedValue = value.trim();

          // Handle specific fields we know about
          if (key === 'path') {
            currentSubmodule.path = trimmedValue;
          } else if (key === 'url') {
            currentSubmodule.url = trimmedValue;
          } else {
            // Store any other properties
            currentSubmodule.properties[key] = trimmedValue;
          }
        }
      }
    }
  }

  addSubmoduleIfComplete(currentSubmodule);

  return submodules;
};

/**
 * @param uri URI to check
 * @returns boolean indicating if the URI is a .gitmodules file
 */
export const isGitModulesFile = (uri: URI): boolean => {
  const { fsPath } = uri;
  return fsPath.endsWith('/.gitmodules') || fsPath.endsWith('\\.gitmodules');
};
