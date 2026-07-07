import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { DefaultConfigService, type ConfigService } from '@gitlab-org/config';
import type {
  AIContextItem,
  AIContextProvider,
  AiContextTransformerService,
} from '@gitlab-org/ai-context';
import type { DuoFeatureAccessService, DuoFeature } from '@gitlab-org/duo-feature-access';
import { DefaultCliContextManager } from './cli_ai_context_manager';

describe('DefaultCliContextManager', () => {
  let manager: DefaultCliContextManager;
  let mockLogger: TestLogger;
  let configService: ConfigService;
  let mockTransformerService: AiContextTransformerService;
  let mockProviders: AIContextProvider[];
  let mockDuoFeatureAccessService: DuoFeatureAccessService;

  const createMockItem = (overrides: Partial<AIContextItem> = {}): AIContextItem => ({
    id: 'test-item',
    category: 'file',
    content: 'test content',
    metadata: {
      enabled: true,
      subType: 'local_file_search',
      title: 'test.ts',
      icon: 'document',
      secondaryText: '@src/test.ts',
      subTypeLabel: 'Project file',
    },
    ...overrides,
  });

  beforeEach(() => {
    mockLogger = new TestLogger();

    configService = new DefaultConfigService();

    mockTransformerService = createFakePartial<AiContextTransformerService>({
      transform: jest
        .fn<(context: AIContextItem) => Promise<AIContextItem>>()
        .mockImplementation((item) => Promise.resolve(item)),
    });

    mockProviders = [];

    mockDuoFeatureAccessService = createFakePartial<DuoFeatureAccessService>({
      isChatFeatureEnabled: jest
        .fn<(feature: DuoFeature) => Promise<boolean>>()
        .mockResolvedValue(true),
    });

    manager = new DefaultCliContextManager(
      mockLogger,
      configService,
      mockTransformerService,
      mockProviders,
      mockDuoFeatureAccessService,
    );
  });

  describe('syncWithTextBuffer', () => {
    describe('when item is still referenced in text', () => {
      it('should not remove the item', async () => {
        const item = createMockItem({
          id: '/path/to/foo.ts',
          metadata: {
            enabled: true,
            subType: 'local_file_search',
            title: 'foo.ts',
            icon: 'document',
            secondaryText: '@foo.ts',
            subTypeLabel: 'Project file',
          },
        });

        jest.spyOn(manager, 'getSelectedContextItems').mockResolvedValue([item]);
        const removeSelectedContextItemSpy = jest.spyOn(manager, 'removeSelectedContextItem');

        await manager.syncWithTextBuffer('hello @foo.ts world');

        expect(removeSelectedContextItemSpy).not.toHaveBeenCalled();
      });
    });

    describe('when item is no longer referenced in text', () => {
      it('should remove the item when reference is partially deleted', async () => {
        const item = createMockItem({
          id: '/path/to/foo.ts',
          metadata: {
            enabled: true,
            subType: 'local_file_search',
            title: 'foo.ts',
            icon: 'document',
            secondaryText: '@foo.ts',
            subTypeLabel: 'Project file',
          },
        });

        jest.spyOn(manager, 'getSelectedContextItems').mockResolvedValue([item]);
        const removeSelectedContextItemSpy = jest
          .spyOn(manager, 'removeSelectedContextItem')
          .mockResolvedValue(true);

        await manager.syncWithTextBuffer('hello @foo.t world');

        expect(removeSelectedContextItemSpy).toHaveBeenCalledWith(item);
      });

      it('should remove the item when reference is completely removed', async () => {
        const item = createMockItem({
          id: '/path/to/foo.ts',
          metadata: {
            enabled: true,
            subType: 'local_file_search',
            title: 'foo.ts',
            icon: 'document',
            secondaryText: '@foo.ts',
            subTypeLabel: 'Project file',
          },
        });

        jest.spyOn(manager, 'getSelectedContextItems').mockResolvedValue([item]);
        const removeSelectedContextItemSpy = jest
          .spyOn(manager, 'removeSelectedContextItem')
          .mockResolvedValue(true);

        await manager.syncWithTextBuffer('hello world');

        expect(removeSelectedContextItemSpy).toHaveBeenCalledWith(item);
      });
    });

    describe('when text contains quoted references', () => {
      const item = createMockItem({
        id: '/path/to/path with spaces/file.ts',
        metadata: {
          enabled: true,
          subType: 'local_file_search',
          title: 'file.ts',
          icon: 'document',
          secondaryText: '@"path with spaces/file.ts"',
          subTypeLabel: 'Project file',
        },
      });

      beforeEach(() => {
        jest.spyOn(manager, 'getSelectedContextItems').mockResolvedValue([item]);
      });

      it('should preserve item with spaces when quoted correctly', async () => {
        const removeSelectedContextItemSpy = jest.spyOn(manager, 'removeSelectedContextItem');

        await manager.syncWithTextBuffer('check @"path with spaces/file.ts" please');

        expect(removeSelectedContextItemSpy).not.toHaveBeenCalled();
      });

      it('should remove item when quoted reference is incomplete', async () => {
        const removeSelectedContextItemSpy = jest
          .spyOn(manager, 'removeSelectedContextItem')
          .mockResolvedValue(true);

        await manager.syncWithTextBuffer('check @"path with spaces/file.t" please');

        expect(removeSelectedContextItemSpy).toHaveBeenCalledWith(item);
      });
    });

    describe('when text contains unclosed quoted reference', () => {
      it('should ignore unclosed quotes and remove the item', async () => {
        const item = createMockItem({
          id: '/path/to/my file.ts',
          metadata: {
            enabled: true,
            subType: 'local_file_search',
            title: 'my file.ts',
            icon: 'document',
            secondaryText: '@"my file.ts"',
            subTypeLabel: 'Project file',
          },
        });

        jest.spyOn(manager, 'getSelectedContextItems').mockResolvedValue([item]);
        const removeSelectedContextItemSpy = jest
          .spyOn(manager, 'removeSelectedContextItem')
          .mockResolvedValue(true);

        await manager.syncWithTextBuffer('check @"my file.ts please');

        expect(removeSelectedContextItemSpy).toHaveBeenCalledWith(item);
      });
    });

    describe('when text contains multiple references', () => {
      const item1 = createMockItem({
        id: '/path/to/foo.ts',
        metadata: {
          enabled: true,
          subType: 'local_file_search',
          title: 'foo.ts',
          icon: 'document',
          secondaryText: '@foo.ts',
          subTypeLabel: 'Project file',
        },
      });
      const item2 = createMockItem({
        id: '/path/to/bar.ts',
        metadata: {
          enabled: true,
          subType: 'local_file_search',
          title: 'bar.ts',
          icon: 'document',
          secondaryText: '@bar.ts',
          subTypeLabel: 'Project file',
        },
      });
      const item3 = createMockItem({
        id: '/path/to/baz.ts',
        metadata: {
          enabled: true,
          subType: 'local_file_search',
          title: 'baz.ts',
          icon: 'document',
          secondaryText: '@baz.ts',
          subTypeLabel: 'Project file',
        },
      });

      it('should preserve all items that are still referenced', async () => {
        jest.spyOn(manager, 'getSelectedContextItems').mockResolvedValue([item1, item2, item3]);
        const removeSelectedContextItemSpy = jest
          .spyOn(manager, 'removeSelectedContextItem')
          .mockResolvedValue(true);

        await manager.syncWithTextBuffer('look at @foo.ts and @bar.ts');

        expect(removeSelectedContextItemSpy).toHaveBeenCalledTimes(1);
        expect(removeSelectedContextItemSpy).toHaveBeenCalledWith(item3);
      });

      it('should remove multiple items no longer referenced', async () => {
        jest.spyOn(manager, 'getSelectedContextItems').mockResolvedValue([item1, item2]);
        const removeSelectedContextItemSpy = jest
          .spyOn(manager, 'removeSelectedContextItem')
          .mockResolvedValue(true);

        await manager.syncWithTextBuffer('look at @other.ts');

        expect(removeSelectedContextItemSpy).toHaveBeenCalledTimes(2);
        expect(removeSelectedContextItemSpy).toHaveBeenCalledWith(item1);
        expect(removeSelectedContextItemSpy).toHaveBeenCalledWith(item2);
      });
    });

    describe('when text is empty', () => {
      it('should remove all selected items', async () => {
        const item1 = createMockItem({
          id: '/path/to/foo.ts',
          metadata: {
            enabled: true,
            subType: 'local_file_search',
            title: 'foo.ts',
            icon: 'document',
            secondaryText: '@foo.ts',
            subTypeLabel: 'Project file',
          },
        });
        const item2 = createMockItem({
          id: '/path/to/bar.ts',
          metadata: {
            enabled: true,
            subType: 'local_file_search',
            title: 'bar.ts',
            icon: 'document',
            secondaryText: '@bar.ts',
            subTypeLabel: 'Project file',
          },
        });

        jest.spyOn(manager, 'getSelectedContextItems').mockResolvedValue([item1, item2]);
        const removeSelectedContextItemSpy = jest
          .spyOn(manager, 'removeSelectedContextItem')
          .mockResolvedValue(true);

        await manager.syncWithTextBuffer('');

        expect(removeSelectedContextItemSpy).toHaveBeenCalledTimes(2);
        expect(removeSelectedContextItemSpy).toHaveBeenCalledWith(item1);
        expect(removeSelectedContextItemSpy).toHaveBeenCalledWith(item2);
      });
    });

    describe('when there are no selected items', () => {
      it('should not attempt any removals', async () => {
        jest.spyOn(manager, 'getSelectedContextItems').mockResolvedValue([]);
        const removeSelectedContextItemSpy = jest
          .spyOn(manager, 'removeSelectedContextItem')
          .mockResolvedValue(true);

        await manager.syncWithTextBuffer('@foo.ts @bar.ts');

        expect(removeSelectedContextItemSpy).not.toHaveBeenCalled();
      });
    });

    describe('when reference is at end of text without trailing space', () => {
      it('should preserve the item', async () => {
        const item = createMockItem({
          id: '/path/to/foo.ts',
          metadata: {
            enabled: true,
            subType: 'local_file_search',
            title: 'foo.ts',
            icon: 'document',
            secondaryText: '@foo.ts',
            subTypeLabel: 'Project file',
          },
        });

        jest.spyOn(manager, 'getSelectedContextItems').mockResolvedValue([item]);
        const removeSelectedContextItemSpy = jest
          .spyOn(manager, 'removeSelectedContextItem')
          .mockResolvedValue(true);

        await manager.syncWithTextBuffer('check @foo.ts');

        expect(removeSelectedContextItemSpy).not.toHaveBeenCalled();
      });
    });

    describe('when activation character appears without content', () => {
      it('should not match previously selected items', async () => {
        const item = createMockItem({
          id: '/path/to/foo.ts',
          metadata: {
            enabled: true,
            subType: 'local_file_search',
            title: 'foo.ts',
            icon: 'document',
            secondaryText: '@foo.ts',
            subTypeLabel: 'Project file',
          },
        });

        jest.spyOn(manager, 'getSelectedContextItems').mockResolvedValue([item]);
        const removeSelectedContextItemSpy = jest
          .spyOn(manager, 'removeSelectedContextItem')
          .mockResolvedValue(true);

        await manager.syncWithTextBuffer('@ followed by space');

        expect(removeSelectedContextItemSpy).toHaveBeenCalledWith(item);
      });
    });
  });
});
