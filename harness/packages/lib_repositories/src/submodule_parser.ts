import { URI } from 'vscode-uri';

export interface GitSubmodule {
  name: string;
  /**
   * The raw path from the .gitmodules file
   */
  path: string;
  /**
   * The path to the submodule, relative to the repository root
   */
  filePath: URI;
  url: string;
  repositoryUri: URI;
  workspaceFolderUri: URI;
  properties?: Record<string, string>; // Additional properties like branch, etc.
}
