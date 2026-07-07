import { performance } from 'perf_hooks';
import { fdir as FastDirectoryCrawler } from 'fdir';
import { Injectable } from '@gitlab/needle';
import { URI } from 'vscode-uri';
import { fsPathFromUri, fsPathToUri } from '@gitlab-org/fs';
import { DirectoryWalker, type DirectoryToSearch, log } from '@gitlab-org/legacy-common';

/**
 * A directory walker that uses the desktop filesystem to search for files.
 * IMPORTANT NOTE: you must convert files that come from the file system to URIs
 * All filters (such as `DirectoryToSearch` filter args) are UNIX styled, so to ensure
 * cross-platform compatibility, you must convert the file paths to URIs.
 * We use the `vscode-uri` package to do this conversion.
 */
@Injectable(DirectoryWalker, [])
export class DesktopDirectoryWalker implements DirectoryWalker {
  #applyFilters(fileUri: URI, filters: DirectoryToSearch['filters']) {
    if (!filters) {
      return true;
    }
    if (filters.fileEndsWith) {
      return filters.fileEndsWith.some((end) => fileUri.toString().endsWith(end));
    }
    return true;
  }

  async findFilesForDirectory(args: DirectoryToSearch): Promise<URI[]> {
    const { filters, directoryUri } = args;
    const perf = performance.now();
    const pathMap = new Map<string, URI>();
    const promise = new FastDirectoryCrawler()
      .withFullPaths()
      .filter((path) => {
        const fileUri = fsPathToUri(path);
        // save each normalized filesystem path avoid re-parsing the path
        pathMap.set(path, fileUri);
        return this.#applyFilters(fileUri, filters);
      })
      .crawl(fsPathFromUri(directoryUri))
      .withPromise();
    const paths = await promise;
    log.debug(
      `DirectoryWalker: found ${paths.length} paths, took ${Math.round(performance.now() - perf)}ms`,
    );
    return paths.map((path) => pathMap.get(path)) as URI[];
  }
}
