import { AIContextProviderType } from '@gitlab-org/ai-context';
import { Logger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { IDocContext } from '../../document_transformer_service';
import { DisabledItemPreProcessor } from './disabled_item';
import { CodeSuggestionsAIContextItem } from './pre_processor_pipeline';

describe('DisabledItemPreProcessor', () => {
  let processor: DisabledItemPreProcessor;
  let mockContext: IDocContext;
  let mockContextItem: CodeSuggestionsAIContextItem;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockContext = createFakePartial<IDocContext>({
      prefix: 'prefix',
      suffix: 'suffix',
    });

    mockContextItem = createFakePartial<CodeSuggestionsAIContextItem>({
      id: 'test-id',
      category: 'file',
      metadata: {
        title: 'test.ts',
        enabled: true,
        icon: 'document',
        secondaryText: 'test.ts',
        subType: 'open_tab',
        subTypeLabel: 'Project file',
        allSources: ['open_tab'],
      },
    });

    mockLogger = {
      info: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    processor = new DisabledItemPreProcessor(mockLogger);
  });

  it('should filter out disabled items and log appropriate messages', async () => {
    const input = [
      { ...mockContextItem, metadata: { ...mockContextItem.metadata, enabled: true } },
      {
        ...mockContextItem,
        id: 'test-id-2',
        metadata: {
          ...mockContextItem.metadata,
          enabled: false,
          disabledReasons: ['reason1', 'reason2'],
        },
      },
      {
        ...mockContextItem,
        id: 'test-id-3',
        metadata: {
          ...mockContextItem.metadata,
          enabled: false,
          disabledReasons: ['reason1'],
          project: 'test-project',
        },
      },
    ];

    const result = await processor.process({ documentContext: mockContext, aiContextItems: input });
    expect(result.preProcessorItems.aiContextItems).toEqual([input[0]]);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Disabled item: reason1, reason2 '),
      undefined,
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Disabled item: reason1 for project test-project'),
      undefined,
    );
  });

  it('should handle non-open_tab items correctly', async () => {
    const nonOpenTabItem = {
      ...mockContextItem,
      metadata: {
        ...mockContextItem.metadata,
        subType: 'local_file_search' as AIContextProviderType,
        allSources: ['local_file_search' as AIContextProviderType],
        enabled: false,
        disabledReasons: ['reason1'],
      },
    };

    const result = await processor.process({
      documentContext: mockContext,
      aiContextItems: [nonOpenTabItem],
    });
    expect(result.preProcessorItems.aiContextItems).toEqual([]);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Disabled item: reason1'),
      undefined,
    );
  });
});
