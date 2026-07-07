import { AIContextItem, AIContextCategory } from '@gitlab-org/ai-context';
import { Logger, TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { IDocContext } from '../../document_transformer_service';
import { SupportedLanguagesService } from '../../suggestion/supported_languages_service';
import { SupportedLanguagePreProcessor } from './supported_language';

jest.mock('../../log', () => ({
  log: {
    debug: jest.fn(),
  },
}));

describe('SupportedLanguagePreProcessor', () => {
  let processor: SupportedLanguagePreProcessor;
  let mockContext: IDocContext;
  let mockContextItem: AIContextItem;
  let supportedLanguagesService: SupportedLanguagesService;
  let mockLogger: Logger;
  beforeEach(() => {
    mockContext = createFakePartial<IDocContext>({
      prefix: 'prefix',
      suffix: 'suffix',
    });

    mockContextItem = createFakePartial<AIContextItem>({
      id: 'test-id',
      category: 'file' as AIContextCategory,
      metadata: {
        languageId: 'typescript',
        title: 'test.ts',
        enabled: true,
        icon: 'document',
        secondaryText: 'test.ts',
        subType: 'open_tab',
        subTypeLabel: 'Project file',
      },
    });

    mockLogger = new TestLogger();

    supportedLanguagesService = createFakePartial<SupportedLanguagesService>({
      isLanguageEnabled: jest.fn(),
    });

    processor = new SupportedLanguagePreProcessor(mockLogger, supportedLanguagesService);
  });

  it('should filter out files with unsupported languages', async () => {
    jest
      .mocked(supportedLanguagesService.isLanguageEnabled)
      .mockImplementation((lang) => lang === 'typescript');

    const input = [
      mockContextItem,
      {
        ...mockContextItem,
        id: 'test-id-2',
        metadata: { ...mockContextItem.metadata, languageId: 'ruby' },
      },
      { ...mockContextItem, id: 'test-id-3', category: 'snippet' as AIContextCategory },
    ];

    const result = await processor.process({ documentContext: mockContext, aiContextItems: input });
    expect(result.preProcessorItems.aiContextItems).toEqual([
      expect.objectContaining({ id: 'test-id' }),
      expect.objectContaining({ id: 'test-id-3' }),
    ]);

    expect(supportedLanguagesService.isLanguageEnabled).toHaveBeenCalledWith('typescript');
    expect(supportedLanguagesService.isLanguageEnabled).toHaveBeenCalledWith('ruby');
    expect(supportedLanguagesService.isLanguageEnabled).toHaveBeenCalledTimes(2);
  });

  it('should not check language support for non-file types', async () => {
    const input = [{ ...mockContextItem, category: 'snippet' as AIContextCategory }];

    const result = await processor.process({ documentContext: mockContext, aiContextItems: input });
    expect(result.preProcessorItems.aiContextItems).toEqual([
      expect.objectContaining({ id: 'test-id' }),
    ]);
    expect(supportedLanguagesService.isLanguageEnabled).not.toHaveBeenCalled();
  });

  it('should not filter files without a language ID', async () => {
    const input = [
      {
        ...mockContextItem,
        metadata: {
          ...mockContextItem.metadata,
          languageId: undefined,
        },
      },
    ];

    const result = await processor.process({ documentContext: mockContext, aiContextItems: input });
    expect(result.preProcessorItems.aiContextItems).toEqual([
      expect.objectContaining({ id: 'test-id' }),
    ]);
    expect(supportedLanguagesService.isLanguageEnabled).not.toHaveBeenCalled();
  });

  it('should handle empty input array', async () => {
    const result = await processor.process({ documentContext: mockContext, aiContextItems: [] });
    expect(result.preProcessorItems.aiContextItems).toEqual([]);
    expect(supportedLanguagesService.isLanguageEnabled).not.toHaveBeenCalled();
  });
});
