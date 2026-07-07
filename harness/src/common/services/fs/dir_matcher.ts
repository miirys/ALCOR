// eslint-disable-next-line max-classes-per-file
import { URI, Utils } from 'vscode-uri';
import { splitPath } from '@gitlab-org/fs';

class DirectoryMatcherTrie {
  pathSegment: string;

  children: Map<string, DirectoryMatcherTrie>;

  dirToMatch?: string;

  constructor(dirPart: string) {
    this.children = new Map();
    this.pathSegment = dirPart;
  }

  dispose(): void {
    this.children.clear();
    this.dirToMatch = undefined;
  }
}

/**
 * FastDirectoryMatcher is used to efficiently match
 * directories against a set of URIs relative to a root.
 *
 * This is an internal class for the `GitIgnoreManager` and `RepositoryService class
 * at this time.
 *
 * The trie data structure allows for quick matching of directories
 * so that we can skip checking ignores for irrelevant directories.
 */
export class FastDirectoryMatcher {
  #root: DirectoryMatcherTrie;

  constructor() {
    this.#root = new DirectoryMatcherTrie('');
  }

  /**
   * Add a file URI to the matcher.
   * @param uri The URI to match against.
   * This will take the parent directory of the file (dirname) and add it to the matcher.
   * For example, if you pass in the following URIs:
   * - `file:///foo/bar/some_file.txt`
   * - `file:///foo/bar/src/nested_dir/other_file.txt`
   *
   * The matcher will match against:
   * - `file:///foo/bar/`
   * - `file:///foo/bar/src/nested_dir/`
   */
  addFileToMatch(uri: URI): void {
    const dirUri = Utils.dirname(uri);
    this.#addPath(dirUri);
  }

  /**
   * Add a directory URI to the matcher.
   * @param directoryUri The URI to match against.
   * This will add the directory to the matcher.
   * For example, if you pass in the following URIs:
   * - `file:///foo/bar/`
   * - `file:///foo/bar/src/`
   *
   * The matcher will match against:
   * - `file:///foo/bar/`
   * - `file:///foo/bar/src/`
   */
  addDirectoryToMatch(directoryUri: URI): void {
    this.#addPath(directoryUri);
  }

  #addPath(dirUri: URI): void {
    let node: DirectoryMatcherTrie | undefined = this.#root;
    const pathSegments = splitPath(dirUri.toString());
    for (const pathSegment of pathSegments) {
      node =
        node.children.get(pathSegment) ||
        node.children.set(pathSegment, new DirectoryMatcherTrie(pathSegment)).get(pathSegment);
      if (!node) break;
    }
    if (node) {
      node.dirToMatch = dirUri.toString();
    }
  }

  /**
   * Find all matching directories for a given URI.
   * @param uri The URI to match against.
   * @returns An ordered list of URIs that match the given URI
   * relative to the class root, starting with the least specific match.
   */
  findMatchingDirectories(uri: URI): URI[] {
    const parts = splitPath(uri.toString());
    const matches: URI[] = [];

    let node: DirectoryMatcherTrie | undefined = this.#root;

    for (const part of parts) {
      node = node.children.get(part);
      if (!node) {
        break;
      }
      if (node.dirToMatch) {
        matches.push(URI.parse(node.dirToMatch));
      }
    }

    return matches;
  }

  /**
   * Garbage collection should handle this, but for good measure
   * we'll clear the trie when the class is disposed.
   */
  dispose(): void {
    this.#clearNode(this.#root);
    this.#root = new DirectoryMatcherTrie('');
  }

  #clearNode(node: DirectoryMatcherTrie): void {
    for (const child of node.children.values()) {
      this.#clearNode(child);
    }
    node.dispose();
  }
}
