import { DuoFeature } from '@gitlab-org/duo-feature-access';
import { Logger, TestLogger } from '@gitlab-org/logging';
import {
  ANOTHER_OPEN_TAB_FILE,
  INVALID_SUBTYPE_ITEM,
  OPEN_TAB_FILE,
} from '../test_utils/mock_data';
import { AbstractAIContextProvider, AIContextProviderType } from './ai_context_provider';
import { OpenTabAIContextItem } from './open_tabs';

let onContextItemAddedMock: jest.Mock;
let onBeforeContextItemRemovedMock: jest.Mock;
let onBeforeAllContextItemsRemovedMock: jest.Mock;
let canBeAddedMock: jest.Mock;
let logger: Logger;

class MockProviderClass extends AbstractAIContextProvider<OpenTabAIContextItem> {
  readonly chatRequiredFeature: DuoFeature;

  constructor(type: AIContextProviderType, duoRequiredFeature: DuoFeature) {
    super(type, logger);
    this.chatRequiredFeature = duoRequiredFeature;
    this.onContextItemAdded = onContextItemAddedMock;
    this.onBeforeContextItemRemoved = onBeforeContextItemRemovedMock;
    this.onBeforeAllContextItemsRemoved = onBeforeAllContextItemsRemovedMock;
  }

  canItemBeAdded = canBeAddedMock;

  searchContextItems = jest.fn().mockResolvedValue([]);

  retrieveContextItemsWithContent = jest.fn().mockResolvedValue({
    ...Promise.resolve(OPEN_TAB_FILE),
    content: '',
  });

  getItemWithContent = jest.fn();
}

describe('AIContextProvider', () => {
  let provider: AbstractAIContextProvider<OpenTabAIContextItem>;

  beforeEach(() => {
    onContextItemAddedMock = jest.fn();
    onBeforeContextItemRemovedMock = jest.fn();
    onBeforeAllContextItemsRemovedMock = jest.fn();
    canBeAddedMock = jest.fn().mockResolvedValue(true);
    logger = new TestLogger();
    jest.spyOn(logger, 'error');
    provider = new MockProviderClass('open_tab', DuoFeature.IncludeFileContext);
  });

  it('correctly creates a provider instance with the specified type', () => {
    expect(provider).toBeInstanceOf(MockProviderClass);
    expect(provider.type).toBe('open_tab');
  });

  describe('addSelectedContextItem', () => {
    it('correctly adds a context entry', async () => {
      await provider.addSelectedContextItem(OPEN_TAB_FILE);
      expect(await provider.getSelectedContextItems()).toEqual([OPEN_TAB_FILE]);
    });

    it('correctly supports multiple context entries of the same type', async () => {
      await provider.addSelectedContextItem(OPEN_TAB_FILE);
      await provider.addSelectedContextItem(ANOTHER_OPEN_TAB_FILE);
      expect(await provider.getSelectedContextItems()).toEqual([
        OPEN_TAB_FILE,
        ANOTHER_OPEN_TAB_FILE,
      ]);
    });

    it('logs an error when adding a context item of different subType', async () => {
      await provider.addSelectedContextItem(INVALID_SUBTYPE_ITEM);
      expect(logger.error).toHaveBeenCalledWith(
        'Context item type "invalid:subtype" does not match context provider type "open_tab"',
      );
      expect(await provider.getSelectedContextItems()).toEqual([]);
    });

    it('logs an error when adding a context item with already-existing ID', async () => {
      await provider.addSelectedContextItem(OPEN_TAB_FILE);
      await provider.addSelectedContextItem(OPEN_TAB_FILE);
      expect(logger.error).toHaveBeenCalledWith(
        `Context item with ID "${OPEN_TAB_FILE.id}" already exists`,
      );
      expect(await provider.getSelectedContextItems()).toHaveLength(1);
    });

    it('triggers correct handler when a context item is added', async () => {
      expect(onContextItemAddedMock).not.toHaveBeenCalled();
      expect(onContextItemAddedMock).not.toHaveBeenCalled();
      expect(onBeforeContextItemRemovedMock).not.toHaveBeenCalled();
      expect(onBeforeAllContextItemsRemovedMock).not.toHaveBeenCalled();
      await provider.addSelectedContextItem(OPEN_TAB_FILE);
      expect(onContextItemAddedMock).toHaveBeenCalledWith(OPEN_TAB_FILE);
      expect(onBeforeContextItemRemovedMock).not.toHaveBeenCalled();
      expect(onBeforeAllContextItemsRemovedMock).not.toHaveBeenCalled();
    });

    it('does not add item if it is not allowed by policy', async () => {
      canBeAddedMock = jest.fn().mockResolvedValue(false);
      provider = new MockProviderClass('open_tab', DuoFeature.IncludeFileContext);
      await provider.addSelectedContextItem(OPEN_TAB_FILE);
      expect(logger.error).toHaveBeenCalledWith(
        `Context item is not allowed by context policies: ${JSON.stringify(OPEN_TAB_FILE)}`,
      );
      expect(onContextItemAddedMock).not.toHaveBeenCalled();
      expect(await provider.getSelectedContextItems()).toEqual([]);
    });
  });

  describe('removeSelectedContextItem', () => {
    beforeEach(async () => {
      await provider.addSelectedContextItem(OPEN_TAB_FILE);
    });

    it('removes the context entry by id', async () => {
      expect(await provider.getSelectedContextItems()).toEqual([OPEN_TAB_FILE]);
      await provider.removeSelectedContextItem(OPEN_TAB_FILE.id);
      expect(await provider.getSelectedContextItems()).toEqual([]);
    });

    it('throws an error if there is no entry with the passed id', async () => {
      await expect(provider.removeSelectedContextItem('non-existent-id')).rejects.toThrow(
        'Item with id non-existent-id not found in context items.',
      );
    });

    it('triggers correct handler before a context item is removed', async () => {
      expect(onBeforeContextItemRemovedMock).not.toHaveBeenCalled();
      jest.resetAllMocks();
      expect(onContextItemAddedMock).not.toHaveBeenCalled();
      expect(onBeforeContextItemRemovedMock).not.toHaveBeenCalled();
      expect(onBeforeAllContextItemsRemovedMock).not.toHaveBeenCalled();
      await provider.removeSelectedContextItem(OPEN_TAB_FILE.id);
      expect(onContextItemAddedMock).not.toHaveBeenCalled();
      expect(onBeforeContextItemRemovedMock).toHaveBeenCalledWith(OPEN_TAB_FILE);
      expect(onBeforeAllContextItemsRemovedMock).not.toHaveBeenCalled();
    });
  });

  describe('clearSelectedContextItems', () => {
    it('removes all context entries', async () => {
      await provider.addSelectedContextItem(OPEN_TAB_FILE);
      await provider.addSelectedContextItem(ANOTHER_OPEN_TAB_FILE);
      await provider.clearSelectedContextItems();
      expect(await provider.getSelectedContextItems()).toEqual([]);
    });

    it('triggers correct handler before all context items are removed', async () => {
      await provider.addSelectedContextItem(OPEN_TAB_FILE);
      await provider.addSelectedContextItem(ANOTHER_OPEN_TAB_FILE);
      jest.resetAllMocks();
      expect(onContextItemAddedMock).not.toHaveBeenCalled();
      expect(onBeforeContextItemRemovedMock).not.toHaveBeenCalled();
      expect(onBeforeAllContextItemsRemovedMock).not.toHaveBeenCalled();
      await provider.clearSelectedContextItems();
      expect(onContextItemAddedMock).not.toHaveBeenCalled();
      expect(onBeforeContextItemRemovedMock).not.toHaveBeenCalled();
      expect(onBeforeAllContextItemsRemovedMock).toHaveBeenCalledTimes(1);
    });

    it('does nothing if there are no entries', async () => {
      await provider.clearSelectedContextItems();
      expect(await provider.getSelectedContextItems()).toEqual([]);
      expect(onBeforeAllContextItemsRemovedMock).not.toHaveBeenCalled();
    });
  });
});
