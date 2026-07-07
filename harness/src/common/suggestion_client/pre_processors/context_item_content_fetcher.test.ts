import { AIContextItem } from '@gitlab-org/ai-context';
import { Logger, TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { CodeSuggestionContextManager } from '../../ai_context_management/code_suggestion_context_manager';
import { IDocContext } from '../../document_transformer_service';
import { contentFetchedLog, ContextItemContentFetcher } from './context_item_content_fetcher';
import { PreProcessorItems } from './pre_processor_pipeline';

describe('ContextItemContentFetcher', () => {
  let processor: ContextItemContentFetcher;
  let mockLogger: Logger;
  let mockChatContextManager: CodeSuggestionContextManager;
  let mockAIContextItems: AIContextItem[];
  let mockDocContext: IDocContext;
  let mockPreProcessorItems: PreProcessorItems;

  beforeEach(() => {
    mockLogger = new TestLogger();

    mockChatContextManager = createFakePartial<CodeSuggestionContextManager>({
      addContentToItems: jest.fn(),
    });

    mockDocContext = createFakePartial<IDocContext>({
      prefix: 'prefix',
      suffix: 'suffix',
      fileRelativePath: 'test/file.ts',
      position: { line: 0, character: 0 },
      uri: 'file:///test/file.ts',
      languageId: 'typescript',
    });

    mockAIContextItems = [
      createFakePartial<AIContextItem>({
        id: 'item-1',
        category: 'file',
        metadata: {
          title: 'test.ts',
          enabled: true,
          icon: 'document',
          secondaryText: 'test.ts',
          subType: 'open_tab',
          subTypeLabel: 'Project file',
        },
      }),
      createFakePartial<AIContextItem>({
        id: 'item-2',
        category: 'file',
        metadata: {
          title: 'test2.ts',
          enabled: true,
          icon: 'document',
          secondaryText: 'test2.ts',
          subType: 'open_tab',
          subTypeLabel: 'Project file',
        },
      }),
    ];

    mockPreProcessorItems = {
      documentContext: mockDocContext,
      aiContextItems: mockAIContextItems,
    };

    processor = new ContextItemContentFetcher(mockLogger, mockChatContextManager);
  });

  it('should fetch content for AI context items', async () => {
    const itemsWithContent = [
      { ...mockAIContextItems[0], content: 'content for item 1' },
      { ...mockAIContextItems[1], content: 'content for item 2' },
    ];

    (mockChatContextManager.addContentToItems as jest.Mock).mockResolvedValue(itemsWithContent);

    const result = await processor.process(mockPreProcessorItems);

    expect(mockChatContextManager.addContentToItems).toHaveBeenCalledWith(mockAIContextItems);

    expect(result.preProcessorItems.aiContextItems).toEqual(itemsWithContent);
  });

  it('should filter out items with missing content', async () => {
    const itemsWithContent = [
      { ...mockAIContextItems[0], content: 'content for item 1' },
      { ...mockAIContextItems[1], content: null },
    ];

    (mockChatContextManager.addContentToItems as jest.Mock).mockResolvedValue(itemsWithContent);

    const result = await processor.process(mockPreProcessorItems);

    expect(result.preProcessorItems.aiContextItems.length).toBe(1);
    expect(result.preProcessorItems.aiContextItems[0]).toEqual(itemsWithContent[0]);
  });

  it('should log errors for items with missing content', async () => {
    const itemsWithContent = [{ ...mockAIContextItems[0], content: null }];

    (mockChatContextManager.addContentToItems as jest.Mock).mockResolvedValue(itemsWithContent);

    const errorSpy = jest.spyOn(mockLogger, 'error');

    await processor.process(mockPreProcessorItems);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Content is missing for ${mockAIContextItems[0].id}`),
      undefined,
    );
  });

  it('should log info for successfully fetched content', async () => {
    const itemsWithContent = [{ ...mockAIContextItems[0], content: 'content for item 1' }];

    (mockChatContextManager.addContentToItems as jest.Mock).mockResolvedValue(itemsWithContent);

    const infoSpy = jest.spyOn(mockLogger, 'info');

    await processor.process(mockPreProcessorItems);

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining(contentFetchedLog(mockAIContextItems[0].id)),
      undefined,
    );
  });

  it('should handle empty input array', async () => {
    (mockChatContextManager.addContentToItems as jest.Mock).mockResolvedValue([]);

    const result = await processor.process({
      documentContext: mockDocContext,
      aiContextItems: [],
    });

    expect(result.preProcessorItems.aiContextItems).toEqual([]);
  });

  it('should preserve other properties in preProcessorItems', async () => {
    const itemsWithContent = [{ ...mockAIContextItems[0], content: 'content for item 1' }];

    const itemsWithExtraProps = {
      aiContextItems: mockAIContextItems,
      documentContext: mockDocContext,
      extraProp: 'extra value',
    };

    (mockChatContextManager.addContentToItems as jest.Mock).mockResolvedValue(itemsWithContent);

    const result = await processor.process(itemsWithExtraProps as PreProcessorItems);

    expect(result.preProcessorItems).toEqual({
      aiContextItems: itemsWithContent,
      documentContext: mockDocContext,
      extraProp: 'extra value',
    });
  });
});
