import { v4 as uuidv4 } from 'uuid';
import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import {
  AbstractAIContextProvider,
  AIContextItem,
  AIContextItemMetadata,
} from '@gitlab-org/ai-context';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { LsConnection } from '@gitlab-org/core';
import { DuoFeature } from '@gitlab-org/duo-feature-access';
import { AiContextEditorRequests, AIContextProvider } from '../..';

export type SelectionContext = {
  fileName: string;
  selectedText?: string;
};

export type EditorSelectionContextItem = AIContextItem & {
  category: 'file';
  metadata: AIContextItemMetadata &
    SelectionContext & {
      subType: 'snippet';
      enabled: boolean;
      relativePath?: string;
    };
};

interface EditorSelectionContextProvider
  extends AbstractAIContextProvider<EditorSelectionContextItem> {}

@Service({
  dependencies: [Logger, LsConnection],
  lifetime: ServiceLifetime.Transient,
})
@Implements(AIContextProvider)
export class DefaultEditorSelectionContextProvider
  extends AbstractAIContextProvider<EditorSelectionContextItem>
  implements EditorSelectionContextProvider
{
  #logger: Logger;

  #lsConnection: LsConnection;

  readonly chatRequiredFeature = DuoFeature.IncludeSnippetContext;

  constructor(logger: Logger, lsConnection: LsConnection) {
    super('snippet', withPrefix(logger, '[EditorSelectionContextProvider]'));
    this.#logger = withPrefix(logger, '[EditorSelectionContextProvider]');
    this.#lsConnection = lsConnection;
  }

  async #getActiveSelection(): Promise<SelectionContext | null> {
    try {
      const selection = await this.#lsConnection.sendRequest<SelectionContext | null>(
        AiContextEditorRequests.EDITOR_SELECTION,
        undefined,
      );
      return selection;
    } catch (error) {
      this.#logger.error('Error getting active selection:', error);
      return null;
    }
  }

  async searchContextItems(): Promise<EditorSelectionContextItem[]> {
    const selection = await this.#getActiveSelection();

    if (!selection || !selection.selectedText) {
      this.#logger.debug('No active selection found');
      return [];
    }

    const contextItem: EditorSelectionContextItem = {
      id: `editor_selection:${uuidv4()}`,
      category: 'file',
      content: selection.selectedText,
      metadata: {
        title: 'Editor Selection',
        enabled: true,
        icon: 'doc-code',
        subType: 'snippet',
        subTypeLabel: 'Editor Selection',
        secondaryText: selection.fileName,
        fileName: selection.fileName,
        relativePath: selection.fileName,
      },
    };

    return [contextItem];
  }

  async retrieveContextItemsWithContent(): Promise<EditorSelectionContextItem[]> {
    const activeSelections = await this.searchContextItems();
    activeSelections.forEach((selection) => super.addSelectedContextItem(selection));
    await new Promise(process.nextTick);
    const items = [...(await this.getSelectedContextItems())];
    // We preform a cleanup because this context is not visible in UI
    // but it persists here and is added for future prompts if not cleaned up
    // When we have UI to remove selection
    // we won't have to do this cleanup - user will do it via UI
    activeSelections.forEach((selection) => super.removeSelectedContextItem(selection.id));
    return items;
  }

  async getItemWithContent(item: EditorSelectionContextItem): Promise<EditorSelectionContextItem> {
    return item;
  }
}
