import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DefaultConfigService, ConfigService } from '@gitlab-org/config';
import { DuoFeature, DuoFeatureAccessService } from '@gitlab-org/duo-feature-access';
import type { AiContextTransformerService } from './context_transformers';
import { DefaultChatContextManager } from './chat_context_manager';
import type {
  AIContextProvider,
  AIContextProviderType,
} from './context_providers/ai_context_provider';
import type { AIContextItem } from './ai_context_item';

describe('AI Context Manager', () => {
  let manager: DefaultChatContextManager;
  let mockContextTransformerService: AiContextTransformerService;
  let configService: ConfigService;

  let providerA: jest.Mocked<AIContextProvider<AIContextItem>>;
  let providerB: jest.Mocked<AIContextProvider<AIContextItem>>;

  let logger: TestLogger;
  let duoFeatureAccessService: DuoFeatureAccessService;

  const createMockProvider = (
    type: AIContextProviderType,
    chatRequiredFeature: DuoFeature = DuoFeature.IncludeFileContext,
  ): jest.Mocked<AIContextProvider<AIContextItem>> => ({
    type,
    chatRequiredFeature,
    addSelectedContextItem: jest.fn().mockResolvedValue(undefined),
    removeSelectedContextItem: jest.fn().mockResolvedValue(undefined),
    clearSelectedContextItems: jest.fn().mockResolvedValue(undefined),
    getSelectedContextItems: jest.fn().mockResolvedValue([]),
    searchContextItems: jest.fn().mockResolvedValue([]),
    retrieveContextItemsWithContent: jest.fn().mockResolvedValue([]),
    getItemWithContent: jest.fn().mockResolvedValue(undefined),
  });

  const createMockItem = (
    subType: AIContextProviderType,
    overrides: Partial<AIContextItem> = {},
  ): AIContextItem => ({
    id: `test-item-${subType}`,
    category: 'file',
    content: 'test content',
    metadata: {
      enabled: true,
      subType,
      title: `Test ${subType} item`,
      icon: 'document',
      secondaryText: 'test',
      subTypeLabel: 'Test',
    },
    ...overrides,
  });

  beforeEach(() => {
    configService = new DefaultConfigService();
    mockContextTransformerService = createFakePartial<AiContextTransformerService>({
      transform: jest.fn().mockImplementation((item) => item),
    });

    providerA = createMockProvider('open_tab', DuoFeature.IncludeFileContext);
    providerB = createMockProvider('local_file_search', DuoFeature.IncludeFileContext);

    logger = new TestLogger();

    duoFeatureAccessService = createFakePartial<DuoFeatureAccessService>({
      isChatFeatureEnabled: jest.fn().mockResolvedValue(true),
    });

    manager = new DefaultChatContextManager(
      logger,
      configService,
      mockContextTransformerService,
      [providerA, providerB],
      duoFeatureAccessService,
    );
  });

  describe('addSelectedContextItem', () => {
    it('adds the context item to the matching provider', async () => {
      const item = createMockItem('open_tab');

      const response = await manager.addSelectedContextItem(item);

      expect(response).toBe(true);
      expect(providerA.addSelectedContextItem).toHaveBeenCalledWith(item);
      expect(providerB.addSelectedContextItem).not.toHaveBeenCalled();
    });

    it('returns false if adding context item fails', async () => {
      const item = createMockItem('open_tab');
      providerA.addSelectedContextItem.mockRejectedValue(new Error('Failed to add context item'));

      await expect(manager.addSelectedContextItem(item)).resolves.toBe(false);
    });

    it('returns false if adding item to disabled provider', async () => {
      jest.mocked(duoFeatureAccessService.isChatFeatureEnabled).mockResolvedValue(false);
      await manager.getAvailableCategories();

      const item = createMockItem('open_tab');

      await expect(manager.addSelectedContextItem(item)).resolves.toBe(false);
      expect(providerA.addSelectedContextItem).not.toHaveBeenCalled();
    });

    it('returns false if no provider found for type', async () => {
      const invalidItem = createMockItem('open_tab', {
        metadata: {
          enabled: true,
          subType: 'unknown_type' as AIContextProviderType,
          title: 'Invalid',
          icon: 'document',
          secondaryText: '',
          subTypeLabel: '',
        },
      });

      await expect(manager.addSelectedContextItem(invalidItem)).resolves.toBe(false);
    });

    it('returns false if item has no subType', async () => {
      const noSubtypeItem = createMockItem('open_tab', {
        metadata: {
          enabled: true,
          subType: '' as AIContextProviderType,
          title: 'No Subtype',
          icon: 'document',
          secondaryText: '',
          subTypeLabel: '',
        },
      });

      await expect(manager.addSelectedContextItem(noSubtypeItem)).resolves.toBe(false);
    });
  });

  describe('removeSelectedContextItem', () => {
    it('removes a context item from the matching provider', async () => {
      const item = createMockItem('open_tab');

      const result = await manager.removeSelectedContextItem(item);

      expect(result).toBe(true);
      expect(providerA.removeSelectedContextItem).toHaveBeenCalledWith(item.id);
      expect(providerB.removeSelectedContextItem).not.toHaveBeenCalled();
    });

    it('returns false if removing a context item fails', async () => {
      const item = createMockItem('open_tab');
      providerA.removeSelectedContextItem.mockRejectedValue(
        new Error('Failed to remove context item'),
      );

      await expect(manager.removeSelectedContextItem(item)).resolves.toBe(false);
    });

    it('returns false if no provider found for type', async () => {
      const invalidItem = createMockItem('open_tab', {
        metadata: {
          enabled: true,
          subType: 'unknown_type' as AIContextProviderType,
          title: 'Invalid',
          icon: 'document',
          secondaryText: '',
          subTypeLabel: '',
        },
      });

      await expect(manager.removeSelectedContextItem(invalidItem)).resolves.toBe(false);
    });
  });

  describe('searchContextItems', () => {
    it('calls searchContextItems on providers matching the category', async () => {
      const itemA = createMockItem('open_tab');
      const itemB = createMockItem('local_file_search');
      providerA.searchContextItems.mockResolvedValue([itemA]);
      providerB.searchContextItems.mockResolvedValue([itemB]);

      const result = await manager.searchContextItems({
        category: 'file',
        query: 'test',
        workspaceFolders: [],
      });

      expect(result).toEqual([itemA, itemB]);
      expect(providerA.searchContextItems).toHaveBeenCalled();
      expect(providerB.searchContextItems).toHaveBeenCalled();
    });

    it('uses workspaceFolders from query params', async () => {
      const query = {
        category: 'file' as const,
        query: 'test',
        workspaceFolders: [{ uri: 'file:///custom', name: 'Custom' }],
      };

      await manager.searchContextItems(query);

      expect(providerA.searchContextItems).toHaveBeenCalledWith(query);
    });

    it('falls back to config workspaceFolders when not provided in query', async () => {
      const workspaceFolders = [{ uri: 'file:///workspace', name: 'Test Workspace' }];
      configService.set('workspaceFolders', workspaceFolders);

      const query = { category: 'file' as const, query: 'test' };
      await manager.searchContextItems(query);

      expect(providerA.searchContextItems).toHaveBeenCalledWith({
        ...query,
        workspaceFolders,
      });
    });

    it('filters out already selected items', async () => {
      const selectedItem = createMockItem('open_tab', { id: 'selected' });
      const unselectedItem = createMockItem('open_tab', { id: 'unselected' });

      providerA.searchContextItems.mockResolvedValue([selectedItem, unselectedItem]);
      providerA.getSelectedContextItems.mockResolvedValue([selectedItem]);

      const result = await manager.searchContextItems({
        category: 'file',
        query: 'test',
        workspaceFolders: [],
      });

      expect(result).toEqual([unselectedItem]);
    });

    it('puts disabled items at the end of the list', async () => {
      const enabledItem = createMockItem('open_tab', { id: 'enabled' });
      const disabledItem = createMockItem('open_tab', {
        id: 'disabled',
        metadata: {
          enabled: false,
          subType: 'open_tab',
          title: 'Disabled',
          icon: 'document',
          secondaryText: '',
          subTypeLabel: '',
        },
      });
      const anotherEnabledItem = createMockItem('open_tab', { id: 'another-enabled' });

      providerA.searchContextItems.mockResolvedValue([
        enabledItem,
        disabledItem,
        anotherEnabledItem,
      ]);

      const result = await manager.searchContextItems({
        category: 'file',
        query: 'test',
        workspaceFolders: [],
      });

      expect(result).toEqual([enabledItem, anotherEnabledItem, disabledItem]);
    });

    it('does not call providers of other categories', async () => {
      const issueProvider = createMockProvider('issue', DuoFeature.IncludeIssueContext);
      manager = new DefaultChatContextManager(
        logger,
        configService,
        mockContextTransformerService,
        [providerA, providerB, issueProvider],
        duoFeatureAccessService,
      );

      await manager.searchContextItems({
        category: 'issue',
        query: 'test',
        workspaceFolders: [],
      });

      expect(providerA.searchContextItems).not.toHaveBeenCalled();
      expect(providerB.searchContextItems).not.toHaveBeenCalled();
      expect(issueProvider.searchContextItems).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when all providers for category are disabled', async () => {
      jest.mocked(duoFeatureAccessService.isChatFeatureEnabled).mockResolvedValue(false);
      await manager.getAvailableCategories();

      const result = await manager.searchContextItems({
        category: 'file',
        query: 'test',
        workspaceFolders: [],
      });

      expect(result).toEqual([]);
      expect(providerA.searchContextItems).not.toHaveBeenCalled();
      expect(providerB.searchContextItems).not.toHaveBeenCalled();
    });
  });

  describe('getAvailableCategories', () => {
    it('returns categories for all enabled providers', async () => {
      const categories = await manager.getAvailableCategories();

      expect(categories).toEqual(['file', 'file']);
    });

    it('excludes categories when the provider feature is disabled', async () => {
      const issueProvider = createMockProvider('issue', DuoFeature.IncludeIssueContext);
      manager = new DefaultChatContextManager(
        logger,
        configService,
        mockContextTransformerService,
        [providerA, issueProvider],
        duoFeatureAccessService,
      );

      jest
        .mocked(duoFeatureAccessService.isChatFeatureEnabled)
        .mockImplementation(async (feature) => feature !== DuoFeature.IncludeIssueContext);

      const categories = await manager.getAvailableCategories();

      expect(categories).toContain('file');
      expect(categories).not.toContain('issue');
    });
  });

  describe('retrieveContextItemsWithContent', () => {
    it('calls retrieveContextItemsWithContent on all enabled providers', async () => {
      const itemA = createMockItem('open_tab');
      const itemB = createMockItem('local_file_search');
      providerA.retrieveContextItemsWithContent.mockResolvedValue([itemA]);
      providerB.retrieveContextItemsWithContent.mockResolvedValue([itemB]);

      const result = await manager.retrieveContextItemsWithContent();

      expect(result).toEqual([itemA, itemB]);
      expect(providerA.retrieveContextItemsWithContent).toHaveBeenCalledTimes(1);
      expect(providerB.retrieveContextItemsWithContent).toHaveBeenCalledTimes(1);
    });

    it('only retrieves from enabled providers', async () => {
      const itemA = createMockItem('open_tab');
      providerA.retrieveContextItemsWithContent.mockResolvedValue([itemA]);

      jest
        .mocked(duoFeatureAccessService.isChatFeatureEnabled)
        .mockImplementation(async (feature) => feature === DuoFeature.IncludeFileContext);

      const disabledProvider = createMockProvider(
        'dependency',
        DuoFeature.IncludeDependencyContext,
      );
      manager = new DefaultChatContextManager(
        logger,
        configService,
        mockContextTransformerService,
        [providerA, disabledProvider],
        duoFeatureAccessService,
      );

      await manager.getAvailableCategories();
      const result = await manager.retrieveContextItemsWithContent();

      expect(result).toEqual([itemA]);
      expect(providerA.retrieveContextItemsWithContent).toHaveBeenCalled();
      expect(disabledProvider.retrieveContextItemsWithContent).not.toHaveBeenCalled();
    });

    it('transforms all items through the transformer service', async () => {
      const item = createMockItem('open_tab');
      const transformedItem = { ...item, content: 'transformed' };
      providerA.retrieveContextItemsWithContent.mockResolvedValue([item]);
      providerB.retrieveContextItemsWithContent.mockResolvedValue([]);
      jest.mocked(mockContextTransformerService.transform).mockResolvedValue(transformedItem);

      const result = await manager.retrieveContextItemsWithContent();

      expect(mockContextTransformerService.transform).toHaveBeenCalledTimes(1);
      expect(mockContextTransformerService.transform).toHaveBeenCalledWith(item);
      expect(result).toEqual([transformedItem]);
    });

    it('strips content when transformer service throws an error', async () => {
      const item = createMockItem('open_tab');
      providerA.retrieveContextItemsWithContent.mockResolvedValue([item]);
      providerB.retrieveContextItemsWithContent.mockResolvedValue([]);
      jest.mocked(mockContextTransformerService.transform).mockRejectedValue(new Error('Failed'));

      const result = await manager.retrieveContextItemsWithContent();

      expect(result).toEqual([{ ...item, content: undefined }]);
    });

    it('passes request parameter to all providers when provided', async () => {
      const request = { newConversation: true, mode: 'agentic' as const };

      await manager.retrieveContextItemsWithContent(request);

      expect(providerA.retrieveContextItemsWithContent).toHaveBeenCalledWith(request);
      expect(providerB.retrieveContextItemsWithContent).toHaveBeenCalledWith(request);
    });

    it('passes undefined to all providers when no request provided', async () => {
      await manager.retrieveContextItemsWithContent();

      expect(providerA.retrieveContextItemsWithContent).toHaveBeenCalledWith(undefined);
      expect(providerB.retrieveContextItemsWithContent).toHaveBeenCalledWith(undefined);
    });

    describe('when one provider fails', () => {
      it('returns items from successful providers', async () => {
        providerA.retrieveContextItemsWithContent.mockRejectedValue(new Error('Provider A failed'));
        providerB.retrieveContextItemsWithContent.mockResolvedValue([
          createMockItem('local_file_search'),
        ]);

        const result = await manager.retrieveContextItemsWithContent();

        expect(result).toHaveLength(1);
        expect(logger.errorLogs).toHaveLength(1);
        expect(logger.errorLogs[0].message).toContain(
          'Error retrieving context items from provider type: open_tab',
        );
        expect(logger.errorLogs[0].error).toBeInstanceOf(Error);
      });

      it('returns empty array when all providers fail', async () => {
        providerA.retrieveContextItemsWithContent.mockRejectedValue(new Error('Provider A failed'));
        providerB.retrieveContextItemsWithContent.mockRejectedValue(new Error('Provider B failed'));

        const result = await manager.retrieveContextItemsWithContent();

        expect(result).toEqual([]);
        expect(logger.errorLogs).toHaveLength(2);
      });
    });
  });

  describe('getItemWithContent', () => {
    it('calls getItemWithContent on the matching provider', async () => {
      const item = createMockItem('open_tab');
      providerA.getItemWithContent.mockResolvedValue(item);

      await manager.getItemWithContent(item);

      expect(providerA.getItemWithContent).toHaveBeenCalledWith(item);
      expect(providerB.getItemWithContent).not.toHaveBeenCalled();
    });

    it('throws an error if provided with an unknown item type', async () => {
      const invalidItem = createMockItem('open_tab', {
        metadata: {
          enabled: true,
          subType: 'unknown_type' as AIContextProviderType,
          title: 'Invalid',
          icon: 'document',
          secondaryText: '',
          subTypeLabel: '',
        },
      });

      await expect(manager.getItemWithContent(invalidItem)).rejects.toThrow(
        'No provider found for type "unknown_type"',
      );
    });

    it('transforms item through the transformer service', async () => {
      const item = createMockItem('open_tab');
      const transformedItem = { ...item, content: 'transformed' };
      providerA.getItemWithContent.mockResolvedValue(item);
      jest.mocked(mockContextTransformerService.transform).mockResolvedValue(transformedItem);

      const result = await manager.getItemWithContent(item);

      expect(mockContextTransformerService.transform).toHaveBeenCalledWith(item);
      expect(result).toEqual(transformedItem);
    });

    it('strips content when transformer service throws an error', async () => {
      const item = createMockItem('open_tab');
      providerA.getItemWithContent.mockResolvedValue(item);
      jest.mocked(mockContextTransformerService.transform).mockRejectedValue(new Error('Failed'));

      const result = await manager.getItemWithContent(item);

      expect(result).toEqual({ ...item, content: undefined });
    });
  });

  describe('getProviderForType', () => {
    it('returns the provider for the given type', async () => {
      const provider = await manager.getProviderForType('open_tab');

      expect(provider).toBe(providerA);
    });

    it('throws an error if the provider is not found', async () => {
      await expect(manager.getProviderForType('unknown' as AIContextProviderType)).rejects.toThrow(
        'No provider found for type "unknown"',
      );
    });
  });
});
