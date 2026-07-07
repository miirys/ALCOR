import {
  AbstractAIContextProvider,
  AIContextItem,
  AIContextItemMetadata,
} from '@gitlab-org/ai-context';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { type GitLabGID } from '@gitlab-org/core';
import { DuoFeature } from '@gitlab-org/duo-feature-access';
import { AIContextProvider } from '..';

type TerminalMetadata = AIContextItemMetadata & {
  icon: 'terminal';
  subType: 'snippet';
  subTypeLabel: 'Selected terminal output';
};

export interface TerminalAIContextItem extends AIContextItem {
  id: GitLabGID;
  category: 'terminal';
  metadata: TerminalMetadata;
}

export interface TerminalContextProvider extends AbstractAIContextProvider<TerminalAIContextItem> {}

/**
 * This terminal context provider is used slightly different from other providers.
 * There is no `/include` menu UI for `terminal` category, these context items can only be
 * added (programatically) via IDE context menu. As such, this provider does not support searching,
 * loading content for items etc, it is only used for maintaining selection state.
 */
@Service({
  dependencies: [Logger],
  lifetime: ServiceLifetime.Transient,
})
@Implements(AIContextProvider)
export class DefaultTerminalContextProvider
  extends AbstractAIContextProvider<TerminalAIContextItem>
  implements TerminalContextProvider
{
  chatRequiredFeature = DuoFeature.IncludeTerminalContext;

  constructor(logger: Logger) {
    super('snippet', withPrefix(logger, '[TerminalContextProvider]'));
  }

  async searchContextItems(): Promise<TerminalAIContextItem[]> {
    throw new Error('Terminal context provider does not support searching');
  }

  async retrieveContextItemsWithContent(): Promise<TerminalAIContextItem[]> {
    const selectedItems = await this.getSelectedContextItems();
    return Promise.all(selectedItems.map((item) => this.getItemWithContent(item)));
  }

  async getItemWithContent(item: TerminalAIContextItem): Promise<TerminalAIContextItem> {
    if (item.content) {
      return item;
    }

    throw new Error('Terminal context items should always have `content` pre-populated');
  }
}
