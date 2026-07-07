import Parser from 'web-tree-sitter';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { IDocContext } from '../document_transformer_service';
import { AbstractTreeSitterParser, TreeSitterParserLoadState } from './parser';
import type { TreeSitterLanguageInfo } from './languages';

jest.mock('web-tree-sitter', () => {
  const mockParser = {
    setLanguage: jest.fn(),
    parse: jest.fn().mockReturnValue({}),
  };

  const mockLanguage = {
    load: jest.fn().mockResolvedValue({}),
  };

  return {
    __esModule: true,
    default: jest.fn(() => mockParser),
    Language: mockLanguage,
    Parser: jest.fn(() => mockParser),
  };
});

jest.mock('../log');

describe('AbstractTreeSitterParser', () => {
  let treeSitterParser: AbstractTreeSitterParser;
  let languages: TreeSitterLanguageInfo[];

  beforeEach(() => {
    languages = [
      {
        name: 'typescript',
        extensions: ['.ts'],
        wasmPath: '/path/to/tree-sitter-typescript.wasm',
        nodeModulesPath: '/path/to/node_modules',
        editorLanguageIds: ['typescript'],
      },
      {
        name: 'javascript',
        extensions: ['.js'],
        wasmPath: '/path/to/tree-sitter-javascript.wasm',
        nodeModulesPath: '/path/to/node_modules',
        editorLanguageIds: ['javascript'],
      },
    ];
    treeSitterParser = new (class extends AbstractTreeSitterParser {
      async init() {
        this.loadState = TreeSitterParserLoadState.READY;
      }
    })({ languages });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('init', () => {
    it('should initialize the parser', async () => {
      await treeSitterParser.init();
      expect(treeSitterParser.loadStateValue).toBe(TreeSitterParserLoadState.READY);
    });

    it('should handle initialization error', async () => {
      treeSitterParser.init = async () => {
        throw new Error('Initialization error');
      };
      await treeSitterParser.parseFile({} as IDocContext);
      expect(treeSitterParser.loadStateValue).toBe(TreeSitterParserLoadState.ERRORED);
    });
  });

  describe('parseFile', () => {
    it('should parse a file with a valid parser', async () => {
      const iDocContext: IDocContext = {
        fileRelativePath: 'test.ts',
        prefix: 'function test() {}',
        suffix: '',
        position: { line: 0, character: 0 },
        languageId: 'typescript',
        uri: 'file:///test.ts',
      };
      const parseFn = jest.fn().mockReturnValue({});
      const getLanguageFn = jest.fn().mockReturnValue(createFakePartial<Parser.Language>({}));
      jest.spyOn(treeSitterParser, 'getLanguageInfoForFile').mockReturnValue(languages[0]);
      jest.spyOn(treeSitterParser, 'getParser').mockResolvedValue(
        createFakePartial<Parser>({
          parse: parseFn,
          getLanguage: getLanguageFn,
        }),
      );

      const result = await treeSitterParser.parseFile(iDocContext);

      expect(parseFn).toHaveBeenCalled();
      expect(result).toEqual({
        tree: expect.any(Object),
        language: expect.any(Object),
        languageInfo: languages[0],
        parser: expect.any(Object),
      });
    });

    it('should return undefined when no parser is available for the file', async () => {
      const iDocContext: IDocContext = {
        fileRelativePath: 'test.txt',
        prefix: 'Some text',
        suffix: '',
        position: { line: 0, character: 0 },
        languageId: 'plaintext',
        uri: 'file:///test.txt',
      };

      const result = await treeSitterParser.parseFile(iDocContext);

      expect(result).toBeUndefined();
    });
  });

  describe('parseContent', () => {
    it('should parse file content with a valid parser', async () => {
      const content = 'function test() {}';
      const language = 'js';

      const parseFn = jest.fn().mockReturnValue({});
      const getLanguageFn = jest.fn().mockReturnValue(createFakePartial<Parser.Language>({}));
      jest.spyOn(treeSitterParser, 'getLanguageInfoForFile').mockReturnValue(languages[0]);
      jest.spyOn(treeSitterParser, 'getParser').mockResolvedValue(
        createFakePartial<Parser>({
          parse: parseFn,
          getLanguage: getLanguageFn,
        }),
      );

      const result = await treeSitterParser.parseContent(content, language);

      expect(parseFn).toHaveBeenCalled();
      expect(result).toEqual({
        tree: expect.any(Object),
        language: expect.any(Object),
        languageInfo: languages[0],
        parser: expect.any(Object),
      });
    });

    it('should return undefined when no parser is available for the content', async () => {
      const content = 'function test() {}';
      const language = 'plaintext';

      const result = await treeSitterParser.parseContent(content, language);

      expect(result).toBeUndefined();
    });
  });

  describe('getParser', () => {
    it('should return the parser for languageInfo', async () => {
      // mock namespace Parser.Language
      (Parser as unknown as Record<string, unknown>).Language = {
        load: jest.fn().mockResolvedValue({}),
      };
      class FakeParser {
        setLanguage = jest.fn();
      }
      jest.mocked(Parser).mockImplementation(() => createFakePartial<Parser>(new FakeParser()));
      const loadSpy = jest.spyOn(Parser.Language, 'load');
      const result = await treeSitterParser.getParser({
        name: 'typescript',
        extensions: ['.ts'],
        wasmPath: '/path/to/tree-sitter-typescript.wasm',
        nodeModulesPath: '/path/to/node_modules',
        editorLanguageIds: ['typescript'],
      });
      expect(loadSpy).toHaveBeenCalledWith('/path/to/tree-sitter-typescript.wasm');
      expect(result).toBeInstanceOf(FakeParser);
    });

    it('should handle parser loading error', async () => {
      (Parser.Language.load as jest.Mock).mockRejectedValue(new Error('Loading error'));

      const result = await treeSitterParser.getParser({
        name: 'typescript',
        extensions: ['.ts'],
        wasmPath: '/path/to/tree-sitter-typescript.wasm',
        nodeModulesPath: '/path/to/node_modules',
        editorLanguageIds: ['typescript'],
      });

      expect(treeSitterParser.loadStateValue).toBe(TreeSitterParserLoadState.ERRORED);
      expect(result).toBeUndefined();
    });
  });
});
