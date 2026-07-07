import { AbstractAIContextProvider } from '@gitlab-org/ai-context';
import { Logger, TestLogger } from '@gitlab-org/logging';
import {
  DefaultTerminalContextProvider,
  TerminalAIContextItem,
  TerminalContextProvider,
} from './terminal';

describe('DefaultTerminalContextProvider', () => {
  let provider: TerminalContextProvider;
  let mockContextItem: TerminalAIContextItem;
  let logger: Logger;

  beforeEach(() => {
    mockContextItem = {
      id: 'gid://gitlab/Snippet/123',
      category: 'terminal',
      content: 'Terminal content',
      metadata: {
        title: 'Terminal Output',
        icon: 'terminal',
        enabled: true,
        subType: 'snippet',
        subTypeLabel: 'Selected terminal output',
        secondaryText: 'Mock secondary text',
      },
    };
    logger = new TestLogger();

    provider = new DefaultTerminalContextProvider(logger);
  });

  it('correctly creates a terminalProvider instance with the `snippet` type', () => {
    expect(provider).toBeInstanceOf(DefaultTerminalContextProvider);
    expect(provider).toBeInstanceOf(AbstractAIContextProvider);
    expect(provider.type).toBe('snippet');
  });

  describe('searchContextItems', () => {
    it('throws error when called', async () => {
      await expect(
        provider.searchContextItems({
          category: 'terminal',
          query: 'test',
          workspaceFolders: [],
        }),
      ).rejects.toThrow('Terminal context provider does not support searching');
    });
  });

  describe('retrieveContextItemsWithContent', () => {
    it('returns selected items unchanged', async () => {
      const mockItems: TerminalAIContextItem[] = [mockContextItem];

      jest.spyOn(provider, 'getSelectedContextItems').mockResolvedValue(mockItems);

      const result = await provider.retrieveContextItemsWithContent();

      expect(result).toEqual(mockItems);
    });
  });

  describe('getItemWithContent', () => {
    it('returns item as-is if content already exists', async () => {
      const result = await provider.getItemWithContent(mockContextItem);

      expect(result).toBe(mockContextItem);
    });

    it('throws error when content is missing', async () => {
      await expect(
        provider.getItemWithContent({
          ...mockContextItem,
          content: undefined,
        }),
      ).rejects.toThrow('Terminal context items should always have `content` pre-populated');
    });
  });
});
