import type {
  AIContextItem,
  ImportAIContextItem,
  OpenTabAIContextItem,
} from '@gitlab-org/ai-context';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { IDocContext } from '../../document_transformer_service';
import { ContextRanker } from './context_ranker';

describe('ContextRanker', () => {
  let contextRanker: ContextRanker;
  let mockCurrentDocContext: IDocContext;
  let mockAIContextItems: AIContextItem[];
  let mockLogger: TestLogger;

  function createMockOpenTabItem(id: string, lastAccessed: number) {
    return createFakePartial<OpenTabAIContextItem>({
      id,
      metadata: {
        subType: 'open_tab',
        lastAccessed,
      },
    } as OpenTabAIContextItem);
  }

  function createMockImportItem(id: string) {
    return createFakePartial<ImportAIContextItem>({
      id,
      metadata: {
        subType: 'import',
      },
    } as ImportAIContextItem);
  }

  beforeAll(() => {
    const openTabContextItems = [
      createMockOpenTabItem('file-a', 10000),
      createMockOpenTabItem('file-b', 30000),
      createMockOpenTabItem('file-c', 40000),
      createMockOpenTabItem('file-d', 20000),
    ];

    const importContextItems = [
      createMockImportItem('file-e'),
      createMockImportItem('file-f'),
      createMockImportItem('file-a'),
      createMockImportItem('file-d'),
    ];

    mockAIContextItems = [...openTabContextItems, ...importContextItems];

    mockCurrentDocContext = createFakePartial<IDocContext>({
      prefix: 'prefix',
      suffix: 'suffix',
    });

    mockLogger = new TestLogger();

    contextRanker = new ContextRanker(mockLogger);
  });

  it('should combine and order the items correctly', async () => {
    const rankedContextItems = await contextRanker.process({
      documentContext: mockCurrentDocContext,
      aiContextItems: mockAIContextItems,
    });

    const {
      preProcessorItems: { aiContextItems },
    } = rankedContextItems;

    const aiContextItemIds = aiContextItems.map((item) => item.id);
    expect(aiContextItemIds).toEqual([
      'file-d', // both in open tabs and imports, ordered by open tabs last accessed 20000
      'file-a', // both in open tabs and imports, ordered by open tabs last accessed 10000
      'file-e', // imports
      'file-f', // imports
      'file-c', // open tabs with last accessed at 40000
      'file-b', // open tabs with last accessed at 30000
    ]);
  });
});
