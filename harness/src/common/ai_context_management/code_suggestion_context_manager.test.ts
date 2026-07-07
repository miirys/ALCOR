import { Logger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { AIContextProviderType, AiContextTransformerService } from '@gitlab-org/ai-context';
import {
  OPEN_TAB_FILE,
  ANOTHER_OPEN_TAB_FILE,
  IMPORT_FILE,
  INVALID_SUBTYPE_ITEM,
} from '@gitlab-org/ai-context/test_utils';
import { ConfigService } from '@gitlab-org/config';
import { DuoFeatureAccessService, DuoCodeSuggestionsContext } from '@gitlab-org/duo-feature-access';
import { DefaultCodeSuggestionContextManager } from './code_suggestion_context_manager';
import { SuggestionContextProvider } from './code_suggestions_context_provider';

describe('Code Suggestion Context Manager', () => {
  let manager: DefaultCodeSuggestionContextManager;
  let mockOpenTabProvider: SuggestionContextProvider;
  let mockImportProvider: SuggestionContextProvider;
  let mockLocalFilesProvider: SuggestionContextProvider;
  let duoFeatureAccessService: DuoFeatureAccessService;
  let mockContextTransformerService: AiContextTransformerService;

  const createMockProvider = (
    type: AIContextProviderType,
    duoRequiredFeature: SuggestionContextProvider['suggestionsRequiredFeature'],
  ) =>
    createFakePartial<SuggestionContextProvider>({
      type,
      suggestionsRequiredFeature: duoRequiredFeature,
      searchSuggestionContextItems: jest.fn().mockResolvedValue([]),
      addContentToItems: jest.fn().mockResolvedValue([]),
    });

  beforeEach(() => {
    mockOpenTabProvider = createMockProvider('open_tab', DuoCodeSuggestionsContext.OpenTabs);
    mockImportProvider = createMockProvider('import', DuoCodeSuggestionsContext.Imports);
    mockLocalFilesProvider = createMockProvider(
      'local_file_search',
      DuoCodeSuggestionsContext.Imports,
    );

    duoFeatureAccessService = createFakePartial<DuoFeatureAccessService>({
      isSuggestionsFeatureEnabled: jest.fn().mockResolvedValue(true),
    });

    mockContextTransformerService = createFakePartial<AiContextTransformerService>({
      transform: jest.fn().mockImplementation((item) => Promise.resolve(item)),
    });

    const providers = [mockOpenTabProvider, mockImportProvider, mockLocalFilesProvider];

    manager = new DefaultCodeSuggestionContextManager(
      createFakePartial<Logger>({ debug: jest.fn() }),
      createFakePartial<ConfigService>({}),
      mockContextTransformerService,
      providers,
      duoFeatureAccessService,
    );
  });

  describe('searchContextItems', () => {
    it('handles code_suggestions feature type', async () => {
      const mockOpenTabsContext = [OPEN_TAB_FILE, ANOTHER_OPEN_TAB_FILE];
      jest
        .mocked(mockOpenTabProvider.searchSuggestionContextItems)
        .mockResolvedValue(mockOpenTabsContext);

      const mockImportsContext = [IMPORT_FILE];
      jest
        .mocked(mockImportProvider.searchSuggestionContextItems)
        .mockResolvedValue(mockImportsContext);

      const result = await manager.searchContextItems({
        iDocContext: {
          position: { line: 0, character: 0 },
          prefix: 'test',
          suffix: '',
          fileRelativePath: 'test.ts',
          uri: 'file:///test.ts',
          languageId: 'typescript',
        },
      });

      expect(jest.mocked(mockOpenTabProvider.searchSuggestionContextItems)).toHaveBeenCalled();
      expect(jest.mocked(mockLocalFilesProvider.searchSuggestionContextItems)).toHaveBeenCalled();
      expect(result).toEqual([...mockOpenTabsContext, ...mockImportsContext]);
    });

    it('only uses enabled providers for code_suggestions', async () => {
      // Mock local files provider as disabled, but open tabs should still be enabled for code suggestions
      jest.spyOn(duoFeatureAccessService, 'isSuggestionsFeatureEnabled').mockImplementation(
        async (feature) => feature !== DuoCodeSuggestionsContext.Imports, // disable local files provider
      );

      const mockOpenTabsContext = [OPEN_TAB_FILE];
      jest
        .mocked(mockOpenTabProvider.searchSuggestionContextItems)
        .mockResolvedValue(mockOpenTabsContext);
      jest
        .mocked(mockLocalFilesProvider.searchSuggestionContextItems)
        .mockReturnValue(Promise.resolve([]));

      const result = await manager.searchContextItems({
        iDocContext: {
          position: { line: 0, character: 0 },
          prefix: 'test',
          suffix: '',
          fileRelativePath: 'test.ts',
          uri: 'file:///test.ts',
          languageId: 'typescript',
        },
      });

      expect(result).toEqual(mockOpenTabsContext);
      expect(jest.mocked(mockOpenTabProvider.searchSuggestionContextItems)).toHaveBeenCalled();
      expect(
        jest.mocked(mockLocalFilesProvider.searchSuggestionContextItems),
      ).not.toHaveBeenCalled();
    });
  });

  describe('addContentToItems for code_suggestions', () => {
    it('calls addContentToItems with grouped items by provider type', async () => {
      const openTabItem = { ...OPEN_TAB_FILE, id: 'open-tab-1' };
      const importItem = { ...IMPORT_FILE, id: 'import-file-1' };

      jest.mocked(mockOpenTabProvider.addContentToItems).mockResolvedValue([openTabItem]);
      jest.mocked(mockImportProvider.addContentToItems).mockResolvedValue([importItem]);

      jest
        .mocked(mockContextTransformerService.transform)
        .mockResolvedValueOnce(openTabItem)
        .mockResolvedValueOnce(importItem);

      const aiContextItems = [openTabItem, importItem];

      await manager.addContentToItems(aiContextItems);

      expect(mockOpenTabProvider.addContentToItems).toHaveBeenCalledWith([openTabItem]);
      expect(mockImportProvider.addContentToItems).toHaveBeenCalledWith([importItem]);
    });

    it('only uses enabled providers for code suggestions', async () => {
      const openTabItem = { ...OPEN_TAB_FILE, id: 'open-tab-1' };
      const fileSearchItem = {
        ...OPEN_TAB_FILE,
        id: 'file-search-1',
        metadata: { ...OPEN_TAB_FILE.metadata, subType: 'local_file_search' as const },
      };

      // Mock local files provider as disabled, but open tabs should still be enabled for code suggestions
      jest.spyOn(duoFeatureAccessService, 'isSuggestionsFeatureEnabled').mockImplementation(
        async (feature) => feature !== DuoCodeSuggestionsContext.Imports, // disable local files provider
      );

      jest.mocked(mockOpenTabProvider.addContentToItems).mockResolvedValue([openTabItem]);

      jest.mocked(mockContextTransformerService.transform).mockResolvedValue(openTabItem);

      const aiContextItems = [openTabItem, fileSearchItem];

      const result = await manager.addContentToItems(aiContextItems);

      expect(result).toEqual([openTabItem]);
      expect(jest.mocked(mockOpenTabProvider.addContentToItems)).toHaveBeenCalled();
      expect(jest.mocked(mockLocalFilesProvider.addContentToItems)).not.toHaveBeenCalled();
    });

    it('should not call addContentToItems if invalid item type', async () => {
      const invalidItem = { ...INVALID_SUBTYPE_ITEM, id: 'invalid-1' };
      const openTabItem = { ...OPEN_TAB_FILE, id: 'open-tab-1' };

      const aiContextItems = [invalidItem, openTabItem];

      jest.mocked(mockOpenTabProvider.addContentToItems).mockResolvedValue([openTabItem]);

      jest.mocked(mockContextTransformerService.transform).mockResolvedValue(openTabItem);

      const result = await manager.addContentToItems(aiContextItems);

      expect(result).toEqual([openTabItem]);
      expect(mockOpenTabProvider.addContentToItems).toHaveBeenCalledWith([openTabItem]);
    });

    it('transforms items through the transformer service', async () => {
      const item = OPEN_TAB_FILE;
      const transformedItem = { ...item, content: 'transformed' };

      const aiContextItems = [item];

      jest.mocked(mockOpenTabProvider.addContentToItems).mockResolvedValue([item]);
      jest.mocked(mockContextTransformerService.transform).mockResolvedValue(transformedItem);

      const result = await manager.addContentToItems(aiContextItems);

      expect(mockContextTransformerService.transform).toHaveBeenCalledWith(item);
      expect(result).toEqual([transformedItem]);
    });
  });

  describe('#getCodeSuggestionsProviders', () => {
    it('includes all enabled providers for code suggestions search', async () => {
      // Mock all features as enabled
      jest.spyOn(duoFeatureAccessService, 'isSuggestionsFeatureEnabled').mockResolvedValue(true);

      const searchRequest = {
        iDocContext: {
          position: { line: 0, character: 0 },
          prefix: 'test',
          suffix: '',
          fileRelativePath: 'test.ts',
          uri: 'file:///test.ts',
          languageId: 'typescript',
        },
      };

      jest
        .mocked(mockOpenTabProvider.searchSuggestionContextItems)
        .mockResolvedValue([OPEN_TAB_FILE]);
      jest.mocked(mockImportProvider.searchSuggestionContextItems).mockResolvedValue([IMPORT_FILE]);
      jest.mocked(mockLocalFilesProvider.searchSuggestionContextItems).mockResolvedValue([]);

      const result = await manager.searchContextItems(searchRequest);

      // All providers should be called
      expect(jest.mocked(mockOpenTabProvider.searchSuggestionContextItems)).toHaveBeenCalled();
      expect(jest.mocked(mockImportProvider.searchSuggestionContextItems)).toHaveBeenCalled();
      expect(mockLocalFilesProvider.searchSuggestionContextItems).toHaveBeenCalled();
      expect(result).toEqual([OPEN_TAB_FILE, IMPORT_FILE]);
    });
  });

  describe('searchContextItems for code_suggestions', () => {
    it('calls searchContextItems() on all enabled Code Suggestions providers', async () => {
      const result = await manager.searchContextItems({
        iDocContext: {
          position: { line: 0, character: 0 },
          prefix: 'test',
          suffix: '',
          fileRelativePath: 'test.ts',
          uri: 'file:///test.ts',
          languageId: 'typescript',
        },
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
