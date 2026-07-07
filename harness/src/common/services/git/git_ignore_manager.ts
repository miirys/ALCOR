// Note: we polyfill the "path" import to use `path-browserify` to work in Web IDE.
// See `scripts/esbuild/helpers.ts` `pathImportPlugin` for details.
// import path from 'path';
import ignore, { Ignore } from 'ignore';
import { URI, Utils } from 'vscode-uri';
import { getRelativePath } from '@gitlab-org/fs';
// import { v4 as uuidv4 } from 'uuid';
import { FastDirectoryMatcher } from '../fs/dir_matcher';

/**
 * GitIgnoreManager aims to be a spec compliant gitignore manager.
 * It uses the ignore package to match the file against gitignore patterns.
 * It also checks the .gitignore/exclude file in the root of the git repository.
 *
 * A majority of this logic has been adapted from https://github.com/isomorphic-git/isomorphic-git
 *
 * We opted for using our own implementation for both speed and flexibility.
 *
 * This class is stateful: it maintains an internal state of the gitignore
 * files that have been added to the manager. Be sure to update the manager
 * as gitignore files are added, updated, or removed.
 *
 */
export class GitIgnoreManager {
  #rootUri: URI;

  #matcher: FastDirectoryMatcher;

  #excludeFileIgnore?: Ignore;

  #ignoreMap: Map<string, Ignore>;

  /**
   * Create a new GitIgnoreManager.
   *
   * @param rootUri The root URI of the git repository.
   * @param excludeFileContent (optional) The content of the exclude file in the root of the git repository.
   */
  constructor(rootUri: URI) {
    this.#rootUri = rootUri;
    this.#matcher = new FastDirectoryMatcher();
    this.#ignoreMap = new Map();
  }

  /**
   * Add a top level exclude file to the manager.
   * This is typically located at .git/info/exclude.
   */
  addExcludeFile(content: string): void {
    this.#excludeFileIgnore = ignore().add(content);
  }

  /**
   * Add a gitignore file to the manager.
   * This will add the gitignore file to the ignore map and parse the patterns.
   */
  addGitignore(uri: URI, content: string): void {
    const ig = ignore().add(content);
    this.#matcher.addFileToMatch(uri);
    this.#ignoreMap.set(Utils.dirname(uri).toString(), ig);
  }

  /**
   * Check if the given file URI is ignored by git.
   * This will match the file against gitignore patterns in the directory structure
   * and all its parent directories.
   *
   * This also checks the .gitignore/exclude file in the root of the git repository.
   */
  isIgnored(fileUri: URI): boolean {
    // ALWAYS ignore ".git" folders.
    if (Utils.basename(fileUri) === '.git') return true;

    // '.' is not a valid gitignore entry, so '.' is never ignored
    if (fileUri.path === '.') return false;

    const matchingDirs = this.#matcher.findMatchingDirectories(fileUri);

    let ignoredStatus = false;

    const excludeRelativePath = this.#getSafeRelativePath(this.#rootUri, fileUri);
    if (excludeRelativePath && this.#excludeFileIgnore) {
      ignoredStatus = this.#excludeFileIgnore.ignores(excludeRelativePath);
    }

    for (const dir of matchingDirs) {
      const ig = this.#ignoreMap.get(dir.toString());
      if (!ig) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const relativePath = this.#getSafeRelativePath(dir, fileUri);
      if (!relativePath) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const { ignored, unignored } = ig.test(relativePath);
      ignoredStatus = ignoredStatus ? !unignored : ignored;
    }

    return ignoredStatus;
  }

  #getSafeRelativePath(from: URI, to: URI): string | undefined {
    const relativePath = getRelativePath(from, to);

    if (relativePath.startsWith('..')) {
      return undefined;
    }

    return relativePath;
  }

  dispose(): void {
    this.#matcher.dispose();
  }
}
