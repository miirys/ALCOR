import { v4 as uuidv4 } from 'uuid';
import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import {
  AIContextResolverRequest,
  type AIContextItem,
  type AIContextItemMetadata,
  AbstractAIContextProvider,
} from '@gitlab-org/ai-context';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { DuoFeature } from '@gitlab-org/duo-feature-access';
import { OpenTab, OpenTabsService } from '../../open_tabs/open_tabs_service';
import { AIContextProvider } from '..';

type CurrentFileMetadata = AIContextItemMetadata & {
  subType: 'open_tab';
};

export interface CurrentFileContextItem extends AIContextItem {
  category: 'file';
  metadata: CurrentFileMetadata;
}

interface CurrentFileContextProvider extends AbstractAIContextProvider<CurrentFileContextItem> {}

/**
 * Automatically provides context about the user's currently active file.
 * Unlike other file providers, this does NOT include the full file content.
 * Instead, the 'content' field contains the file path and last accessed time.
 * Caches last sent current file to avoid re-sending the same file in consecutive messages.
 */
@Service({
  dependencies: [Logger, OpenTabsService],
  lifetime: ServiceLifetime.Transient,
})
@Implements(AIContextProvider)
export class DefaultCurrentFileContextProvider
  extends AbstractAIContextProvider<CurrentFileContextItem>
  implements CurrentFileContextProvider
{
  chatRequiredFeature = DuoFeature.IncludeFileContext;

  #logger: Logger;

  #openTabsService: OpenTabsService;

  #lastSentFilePath: string | undefined;

  constructor(logger: Logger, openTabsService: OpenTabsService) {
    super('open_tab', withPrefix(logger, '[CurrentFileContextProvider]'));
    this.#logger = withPrefix(logger, '[CurrentFileContextProvider]');
    this.#openTabsService = openTabsService;
  }

  async searchContextItems(): Promise<CurrentFileContextItem[]> {
    this.#logger.warn('Search not implemented for current file context provider');
    return [];
  }

  async retrieveContextItemsWithContent(
    request?: AIContextResolverRequest | null,
  ): Promise<CurrentFileContextItem[]> {
    if (!this.#isAgenticMode(request)) {
      return [];
    }

    const currentFile = await this.#getCurrentOpenTab();
    const currentFilePath = currentFile?.fileRelativePath;

    if (!currentFile || !this.#shouldInclude(currentFilePath, request)) {
      return [];
    }

    this.#logger.debug(`Current file changed to: ${currentFilePath}`);

    const currentFileItems = [this.#formatCurrentFileContextItem(currentFile)];

    await Promise.all(currentFileItems.map((item) => super.addSelectedContextItem(item)));

    const items = [...(await this.getSelectedContextItems())];

    currentFileItems.forEach((item) => super.removeSelectedContextItem(item.id));

    // Track the last file path that was sent as context so we don't send it with every prompt
    this.#lastSentFilePath = currentFilePath;

    return items;
  }

  async getItemWithContent(item: CurrentFileContextItem): Promise<CurrentFileContextItem> {
    return item;
  }

  /**
   * Check if in agentic chat.
   * Don't include in classic chat because the file path on its own is not useful without tools to read the file.
   */
  #isAgenticMode(request?: AIContextResolverRequest | null): Boolean {
    return request?.mode === 'agentic';
  }

  /**
   * Make sure file has changed since it was last sent.
   * Override if this is the first message in the workflow, as provider state carries over between workflows.
   */
  #shouldInclude(
    currentFilePath: string | undefined,
    request?: AIContextResolverRequest | null,
  ): Boolean {
    const currentFileUnchanged =
      currentFilePath === this.#lastSentFilePath && !request?.newConversation;

    if (currentFileUnchanged) {
      this.#logger.debug(`Current file unchanged: ${currentFilePath}`);
      return false;
    }

    return true;
  }

  /**
   * Get most recent open tab from OpenTabsService.
   */
  async #getCurrentOpenTab(): Promise<OpenTab | null> {
    try {
      const openTabs = this.#openTabsService.mostRecentTabs({
        includeCurrentFile: true,
      });

      if (openTabs.length === 0) {
        return null;
      }

      return openTabs.reduce((mostRecent, current) => {
        return current.lastAccessed > mostRecent.lastAccessed ? current : mostRecent;
      });
    } catch (error) {
      this.#logger.warn('Could not create current file context item', error);
      return null;
    }
  }

  /**
   * Format the current file context item with file path + timestamp as content and appropriate metadata.
   */
  #formatCurrentFileContextItem(currentOpenTab: OpenTab): CurrentFileContextItem {
    const metadata: CurrentFileMetadata = {
      title: 'Current File',
      enabled: true,
      subType: 'open_tab',
      icon: 'document',
      secondaryText: currentOpenTab.fileRelativePath,
      subTypeLabel: 'Current File',
    };

    return {
      category: 'file' as const,
      content: `Current file: ${currentOpenTab.fileRelativePath}\nLast accessed: ${new Date().toISOString()}`,
      id: `current-file-${uuidv4()}`,
      metadata,
    };
  }
}
