import Parser from 'web-tree-sitter';
import type { Logger } from '@gitlab-org/logging';
import { createMockLogger } from '@gitlab-org/webview/test_utils';
import { ConfigService, DefaultConfigService } from '@gitlab-org/config';
import { TreeSitterParserLoadState } from '@gitlab-org/legacy-common';
import { BrowserTreeSitterParser } from './index';

jest.mock('web-tree-sitter');

type ParserInitOptions = { locateFile: (scriptName: string) => string };

describe('BrowserTreeSitterParser', () => {
  let subject: BrowserTreeSitterParser;
  let configService: ConfigService;
  let mockLogger: Logger;
  const baseAssetsUrl = 'http://localhost/assets/tree-sitter/';

  describe('init', () => {
    beforeEach(async () => {
      mockLogger = createMockLogger();
      configService = new DefaultConfigService();
      configService.set('baseAssetsUrl', baseAssetsUrl);

      subject = new BrowserTreeSitterParser(mockLogger, configService);
    });

    it('initializes languages list with correct wasmPath', async () => {
      await subject.init();

      const { byExtension, byLanguageId } = subject.getLanguages();

      for (const [, treeSitterLangInfo] of byExtension) {
        expect(treeSitterLangInfo.wasmPath).toContain(baseAssetsUrl);
      }
      for (const [, treeSitterLangInfo] of byLanguageId) {
        expect(treeSitterLangInfo.wasmPath).toContain(baseAssetsUrl);
      }
    });

    it('initializes the Treesitter parser with a locateFile function', async () => {
      let options: ParserInitOptions | undefined;

      jest.mocked(Parser.init).mockImplementationOnce(async (_options?: object) => {
        options = _options as ParserInitOptions;
      });

      await subject.init();

      expect(options?.locateFile).toBeDefined();
      expect(options?.locateFile('tree-sitter.wasm')).toBe(`${baseAssetsUrl}tree-sitter.wasm`);
    });

    it.each`
      initCall                                                             | loadState
      ${() => jest.mocked(Parser.init).mockResolvedValueOnce()}            | ${TreeSitterParserLoadState.READY}
      ${() => jest.mocked(Parser.init).mockRejectedValueOnce(new Error())} | ${TreeSitterParserLoadState.ERRORED}
    `('sets the correct parser load state', async ({ initCall, loadState }) => {
      initCall();

      await subject.init();

      expect(subject.getLoadState()).toBe(loadState);
    });
  });
});
