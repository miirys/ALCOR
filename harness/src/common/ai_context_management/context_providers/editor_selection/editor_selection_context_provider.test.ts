import { v4 as uuidv4 } from 'uuid';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { LsConnection } from '@gitlab-org/core';
import { AiContextEditorRequests } from '../..';
import {
  DefaultEditorSelectionContextProvider,
  EditorSelectionContextItem,
  SelectionContext,
} from './editor_selection_context_provider';

jest.mock('uuid');

describe('DefaultEditorSelectionContextProvider', () => {
  let provider: DefaultEditorSelectionContextProvider;
  let mockLogger: TestLogger;
  let mockLsConnection: LsConnection;
  const mockSelectionContext: SelectionContext = {
    fileName: 'test-file.ts',
    selectedText: 'const foo = "bar";',
  };

  const mockContextItem: EditorSelectionContextItem = {
    id: 'editor_selection:mock-uuid',
    category: 'file',
    content: 'const foo = "bar";',
    metadata: {
      title: 'Editor Selection',
      enabled: true,
      icon: 'doc-code',
      subType: 'snippet',
      subTypeLabel: 'Editor Selection',
      secondaryText: 'test-file.ts',
      fileName: 'test-file.ts',
      relativePath: 'test-file.ts',
    },
  };

  beforeEach(() => {
    jest.mocked(uuidv4).mockReturnValue('mock-uuid');

    mockLogger = new TestLogger();

    mockLsConnection = createFakePartial<LsConnection>({
      sendRequest: jest.fn(),
    });

    provider = new DefaultEditorSelectionContextProvider(mockLogger, mockLsConnection);
  });

  describe('searchContextItems', () => {
    it('should return empty array when no selection is active', async () => {
      jest.mocked(mockLsConnection.sendRequest).mockResolvedValue(null);

      const result = await provider.searchContextItems();

      expect(result).toEqual([]);
      expect(mockLsConnection.sendRequest).toHaveBeenCalledWith(
        AiContextEditorRequests.EDITOR_SELECTION,
        undefined,
      );
    });

    it('should return empty array when selection has no text', async () => {
      jest.mocked(mockLsConnection.sendRequest).mockResolvedValue({
        ...mockSelectionContext,
        selectedText: '',
      });

      const result = await provider.searchContextItems();

      expect(result).toEqual([]);
    });

    it('should return context item with selection info when selection is active', async () => {
      jest.mocked(mockLsConnection.sendRequest).mockResolvedValue(mockSelectionContext);

      const result = await provider.searchContextItems();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockContextItem);
    });

    it('should handle errors when getting active selection', async () => {
      jest.mocked(mockLsConnection.sendRequest).mockRejectedValue(new Error('Connection error'));

      const result = await provider.searchContextItems();

      expect(result).toEqual([]);
    });
  });

  describe('retrieveContextItemsWithContent', () => {
    it('should retrieve context items', async () => {
      jest.mocked(mockLsConnection.sendRequest).mockResolvedValue(mockSelectionContext);

      const result = await provider.retrieveContextItemsWithContent();

      expect(result).toEqual([mockContextItem]);
      expect(mockLsConnection.sendRequest).toHaveBeenCalledWith(
        AiContextEditorRequests.EDITOR_SELECTION,
        undefined,
      );
    });
  });

  describe('getItemWithContent', () => {
    it('should return the same item unchanged', async () => {
      const result = await provider.getItemWithContent(mockContextItem);

      expect(result).toBe(mockContextItem);
    });
  });
});
