import { createInterfaceId, Injectable } from '@gitlab/needle';
import { URI } from 'vscode-uri';

export interface DirectoryToSearch {
  /**
   * The URI of the directory to search.
   * Example: 'file:///path/to/directory'
   */
  directoryUri: URI;
  /**
   * The filters to apply to the search.
   * They form a logical AND, meaning
   * that a file must match all filters to be included in the results.
   */
  filters?: {
    /**
     * The file name or extensions to filter by.
     * MUST be Unix-style paths.
     */
    fileEndsWith?: string[];
  };
}

export interface DirectoryWalker extends DefaultDirectoryWalker {}

export const DirectoryWalker = createInterfaceId<DirectoryWalker>('DirectoryWalker');

@Injectable(DirectoryWalker, [])
export class DefaultDirectoryWalker {
  /**
   * Returns a list of files in the specified directory that match the specified criteria.
   * The returned files will be the full paths to the files, they also will be in the form of URIs.
   * Example: [' file:///path/to/file.txt', 'file:///path/to/another/file.js']
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  findFilesForDirectory(_args: DirectoryToSearch): Promise<URI[]> {
    return Promise.resolve([]);
  }
}
