import { join } from 'node:path';
import { Injectable } from '@gitlab/needle';
import Parser from 'web-tree-sitter';
import {
  log,
  TreeSitterParser,
  AbstractTreeSitterParser,
  TreeSitterParserLoadState,
} from '@gitlab-org/legacy-common';
import { getAssetsRootPath } from '../assets_manager';
import { TREE_SITTER_LANGUAGES } from './languages';

@Injectable(TreeSitterParser, [])
export class DesktopTreeSitterParser extends AbstractTreeSitterParser {
  constructor() {
    super({
      languages: TREE_SITTER_LANGUAGES,
    });
  }

  async init(): Promise<void> {
    // In `bun build --compile`, bun statically rewrites `import.meta.url` to
    // the build-time path on the CI runner, so web-tree-sitter's default wasm
    // lookup resolves to a path that does not exist on user machines. Pass an
    // explicit `locateFile` so the path is computed at runtime against the
    // shipped binary.
    const options =
      process.env.BUNDLE_ENVIRONMENT === 'bun'
        ? { locateFile: (file: string) => join(getAssetsRootPath(), file) }
        : undefined;
    try {
      await Parser.init(options);
      log.debug('DesktopTreeSitterParser: Initialized tree-sitter parser.');
      this.loadState = TreeSitterParserLoadState.READY;
    } catch (err) {
      log.warn('DesktopTreeSitterParser: Error initializing tree-sitter parsers.', err);
      this.loadState = TreeSitterParserLoadState.ERRORED;
    }
  }
}
