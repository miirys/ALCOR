import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import Parser from 'web-tree-sitter';
import {
  COMMON_TREE_SITTER_LANGUAGES,
  AbstractTreeSitterParser,
  TreeSitterParser,
  TreeSitterParserLoadState,
  type TreeSitterLanguageInfo,
} from '@gitlab-org/legacy-common';

const resolveGrammarAbsoluteUrl = (relativeUrl: string, baseAssetsUrl: string = ''): string => {
  return new URL(relativeUrl, baseAssetsUrl).href;
};

@Injectable(TreeSitterParser, [Logger, ConfigService])
export class BrowserTreeSitterParser extends AbstractTreeSitterParser {
  #configService: ConfigService;

  #logger: Logger;

  constructor(logger: Logger, configService: ConfigService) {
    super({ languages: [] });
    this.#configService = configService;
    this.#logger = withPrefix(logger, '[BrowserTreeSitterParser]');
  }

  getLoadState() {
    return this.loadState;
  }

  getLanguages(): {
    byExtension: Map<string, TreeSitterLanguageInfo>;
    byLanguageId: Map<string, TreeSitterLanguageInfo>;
  } {
    return this.languages;
  }

  async init(): Promise<void> {
    const baseAssetsUrl = this.#configService.get('baseAssetsUrl');

    this.languages = AbstractTreeSitterParser.buildTreeSitterInfoByLangAndExtMap(
      COMMON_TREE_SITTER_LANGUAGES.map((definition) => ({
        ...definition,
        wasmPath: resolveGrammarAbsoluteUrl(definition.wasmPath, baseAssetsUrl),
      })),
    );

    try {
      await Parser.init({
        locateFile(scriptName: string) {
          return resolveGrammarAbsoluteUrl(scriptName, baseAssetsUrl);
        },
      });
      this.#logger.debug('Initialized tree-sitter parser.');
      this.loadState = TreeSitterParserLoadState.READY;
    } catch (err) {
      this.#logger.warn('Error initializing tree-sitter parsers.', err);
      this.loadState = TreeSitterParserLoadState.ERRORED;
    }
  }
}
