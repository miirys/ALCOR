import { createInterfaceId } from '@gitlab/needle';
import Parser, { type Language } from 'web-tree-sitter';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { log } from '../log';
import type { IDocContext } from '../document_transformer_service';
import type { TreeSitterLanguageInfo, TreeSitterLanguageName } from './languages';

export enum TreeSitterParserLoadState {
  INIT = 'init',
  ERRORED = 'errored',
  READY = 'ready',
  UNIMPLEMENTED = 'unimplemented',
}

export type TreeAndLanguage = {
  tree: Parser.Tree;
  languageInfo: TreeSitterLanguageInfo;
  language: Language;
  parser: Parser;
};

type ParseFileParams = IDocContext & {
  suggestionText?: string;
};

export interface TreeSitterParser {
  parseFile(context: ParseFileParams): Promise<TreeAndLanguage | undefined>;
  parseContent(content: string, language: string): Promise<TreeAndLanguage | undefined>;
}

interface LanguageMap {
  byExtension: Map<string, TreeSitterLanguageInfo>;
  byLanguageId: Map<string, TreeSitterLanguageInfo>;
}

export const TreeSitterParser = createInterfaceId<TreeSitterParser>('TreeSitterParser');

export abstract class AbstractTreeSitterParser implements TreeSitterParser {
  protected loadState: TreeSitterParserLoadState;

  protected languages: LanguageMap;

  protected readonly parsers = new Map<TreeSitterLanguageName, Parser>();

  abstract init(): Promise<void>;

  constructor({ languages }: { languages: TreeSitterLanguageInfo[] }) {
    this.languages = AbstractTreeSitterParser.buildTreeSitterInfoByLangAndExtMap(languages);
    this.loadState = TreeSitterParserLoadState.INIT;
  }

  get loadStateValue(): TreeSitterParserLoadState {
    return this.loadState;
  }

  async parseFile(context: ParseFileParams): Promise<TreeAndLanguage | undefined> {
    const init = await this.#handleInit();
    if (!init) {
      return undefined;
    }
    const languageInfo = this.getLanguageInfoForFile(context.fileRelativePath, context.languageId);

    if (!languageInfo) {
      return undefined;
    }

    const parser = await this.getParser(languageInfo);
    if (!parser) {
      log.debug(
        'TreeSitterParser: Skipping intent detection using tree-sitter due to missing parser.',
      );
      return undefined;
    }
    const tree = parser.parse(`${context.prefix}${context.suggestionText ?? ''}${context.suffix}`);
    return {
      tree,
      language: parser.getLanguage(),
      languageInfo,
      parser,
    };
  }

  async parseContent(content: string, language: string): Promise<TreeAndLanguage | undefined> {
    const init = await this.#handleInit();
    if (!init) return undefined;

    const languageInfo = this.getLanguageInfoForFile(language);
    if (!languageInfo) return undefined;

    const parser = await this.getParser(languageInfo);
    if (!parser) {
      log.debug(
        'TreeSitterParser: Skipping intent detection using tree-sitter due to missing parser.',
      );
      return undefined;
    }
    const tree = parser.parse(content);
    return {
      tree,
      language: parser.getLanguage(),
      languageInfo,
      parser,
    };
  }

  async #handleInit(): Promise<boolean> {
    try {
      await this.init();
      return true;
    } catch (err) {
      log.warn('TreeSitterParser: Error initializing an appropriate tree-sitter parser', err);
      this.loadState = TreeSitterParserLoadState.ERRORED;
    }
    return false;
  }

  async getParser(languageInfo: TreeSitterLanguageInfo): Promise<Parser | undefined> {
    if (this.parsers.has(languageInfo.name)) {
      return this.parsers.get(languageInfo.name) as Parser;
    }

    try {
      const parser = new Parser();
      const language = await Parser.Language.load(languageInfo.wasmPath);
      parser.setLanguage(language);
      this.parsers.set(languageInfo.name, parser);
      log.debug(
        `TreeSitterParser: Loaded tree-sitter parser (tree-sitter-${languageInfo.name}.wasm present).`,
      );
      return parser;
    } catch (err) {
      this.loadState = TreeSitterParserLoadState.ERRORED;
      // NOTE: We validate the below is not present in generation.test.ts integration test.
      // Make sure to update the test appropriately if changing the error.
      log.warn(
        'TreeSitterParser: Unable to load tree-sitter parser due to an unexpected error.',
        err,
      );
      return undefined;
    }
  }

  getLanguageInfoForFile(
    filename: string,
    languageId?: TextDocument['languageId'],
  ): TreeSitterLanguageInfo | undefined {
    const ext = filename.split('.').pop();
    return languageId
      ? this.languages.byLanguageId.get(languageId)
      : this.languages.byExtension.get(`.${ext}`);
  }

  static buildTreeSitterInfoByLangAndExtMap(languages: TreeSitterLanguageInfo[]): LanguageMap {
    const map = {
      byExtension: new Map<string, TreeSitterLanguageInfo>(),
      byLanguageId: new Map<string, TreeSitterLanguageInfo>(),
    };

    for (const language of languages) {
      language.extensions.forEach((ext) => map.byExtension.set(ext, language));
      language.editorLanguageIds.forEach((id) => map.byLanguageId.set(id, language));
    }

    return map;
  }
}
