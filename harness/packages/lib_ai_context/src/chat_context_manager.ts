import { WorkspaceFolder } from 'vscode-languageserver-types';
import { createInterfaceId } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import { DuoFeatureAccessService } from '@gitlab-org/duo-feature-access';
import { AiContextTransformerService } from './context_transformers';
import { AIContextProvider, AIContextProviderType } from './context_providers/ai_context_provider';
import { AIContextItem } from './ai_context_item';
import { AIContextCategory } from './ai_context_category';
import type { DuoChatAIRequest, AIContextResolverRequest } from '.';

export interface ChatContextManager {
  addSelectedContextItem(contextItem: AIContextItem): Promise<boolean>;
  removeSelectedContextItem(contextItem: AIContextItem): Promise<boolean>;
  getSelectedContextItems(): Promise<AIContextItem[]>;
  searchContextItems(request: DuoChatAIRequest): Promise<AIContextItem[]>;
  getAvailableCategories(): Promise<AIContextCategory[]>;
  retrieveContextItemsWithContent(
    request?: AIContextResolverRequest | null,
  ): Promise<AIContextItem[]>;
  clearSelectedContextItems(): Promise<boolean>;
  getItemWithContent(item: AIContextItem): Promise<AIContextItem>;
}

export interface DuoChatContextManager extends ChatContextManager {}

export const DuoChatContextManager =
  createInterfaceId<DuoChatContextManager>('DuoChatContextManager');

export interface AgenticChatContextManager extends ChatContextManager {}

export const AgenticChatContextManager = createInterfaceId<AgenticChatContextManager>(
  'AgenticChatContextManager',
);

const AIContextMapping: Record<AIContextCategory, AIContextProviderType[]> = {
  file: ['open_tab', 'local_file_search'],
  snippet: ['snippet'],
  terminal: ['snippet'],
  issue: ['issue'],
  merge_request: ['merge_request'],
  dependency: ['dependency'],
  local_git: ['local_git'],
  repository: ['repository'],
  user_rule: ['user_rule'],
  directory: ['directory'],
  agent_user_environment: ['shell'],
  os_information: ['os'],
  // plan_context has no provider: it is not user-pickable and is never queried
  // via getContextForCategory. The CLI builds the item directly
  // (buildPlanContextItem) and sends it on the additionalContext channel.
  plan_context: [],
};

export class DefaultChatContextManager implements ChatContextManager {
  readonly #providers: AIContextProvider<AIContextItem>[] = [];

  readonly #transformerService: AiContextTransformerService;

  readonly #duoFeatureAccessService: DuoFeatureAccessService;

  #workspaceFolders: WorkspaceFolder[];

  readonly #logger: Logger;

  constructor(
    logger: Logger,
    configService: ConfigService,
    aiContextTransformerService: AiContextTransformerService,
    providers: AIContextProvider[],
    duoFeatureAccessService: DuoFeatureAccessService,
  ) {
    this.#logger = withPrefix(logger, 'ChatContextManager');
    this.#transformerService = aiContextTransformerService;
    this.#providers = providers;
    this.#duoFeatureAccessService = duoFeatureAccessService;

    this.#workspaceFolders = configService.get('workspaceFolders') ?? [];
    configService.onConfigChange((config) => {
      this.#workspaceFolders = config.workspaceFolders ?? [];
    });
  }

  async #getAvailableProviders(): Promise<AIContextProvider<AIContextItem>[]> {
    const providerPromises = this.#providers.map(async (provider) => {
      const enabled = await this.#duoFeatureAccessService.isChatFeatureEnabled(
        provider.chatRequiredFeature,
      );
      return enabled ? provider : undefined;
    });
    const providers = await Promise.all(providerPromises);
    return providers.filter((p) => p !== undefined);
  }

  async #getProviderAndPerform(
    subType: AIContextProviderType | undefined,
    callback: (provider: AIContextProvider<AIContextItem>) => Promise<void>,
  ): Promise<void> {
    const e = new Error('No provider found for type');
    const availableProviders = await this.#getAvailableProviders();
    const provider = availableProviders.find((p) => p.type === subType);
    if (!provider) {
      throw e;
    }
    await callback(provider);
  }

  async #getProviderForItem(item: AIContextItem): Promise<AIContextProvider<AIContextItem>> {
    const availableProviders = await this.#getAvailableProviders();
    const foundProvider = availableProviders.find(
      (provider) => provider.type === item.metadata?.subType,
    );
    if (!foundProvider) {
      throw new Error(
        `No provider found for type "${item.metadata.subType || 'undefined item subtype'}"`,
      );
    }
    return foundProvider;
  }

  async addSelectedContextItem(contextItem: AIContextItem): Promise<boolean> {
    // FIXME: chatContextManager should return the result of the operation upstream,
    // the methods should also be async https://gitlab.com/gitlab-org/gitlab/-/issues/489292
    try {
      this.#logger.info(`received context item add request ${contextItem.id}`);
      await this.#getProviderAndPerform(contextItem.metadata?.subType, async (provider) => {
        await provider.addSelectedContextItem(contextItem);
      });
      this.#logger.info(`added item result ${true}`);
      return true;
    } catch (e) {
      this.#logger.error(`error adding context item`, e);
      return false;
    }
  }

  async removeSelectedContextItem(contextItem: AIContextItem): Promise<boolean> {
    this.#logger.info(`received context item remove request ${contextItem.id}`);
    try {
      await this.#getProviderAndPerform(contextItem.metadata?.subType, async (provider) => {
        await provider.removeSelectedContextItem(contextItem.id);
      });
      this.#logger.info(`removed item result ${true}`);
      return true;
    } catch (e) {
      this.#logger.error(`error removing context item`, e);
      return false;
    }
  }

  async getSelectedContextItems(): Promise<AIContextItem[]> {
    const availableProviders = await this.#getAvailableProviders();
    const currentItems = (
      await Promise.all(availableProviders.map((provider) => provider.getSelectedContextItems()))
    ).flat();
    this.#logger.info(`returning ${currentItems.length} current context items`);
    return currentItems;
  }

  async searchContextItems(request: DuoChatAIRequest): Promise<AIContextItem[]> {
    this.#logger.info(
      `received context search query, category: ${request.category}, query: ${request.query}`,
    );
    try {
      const contextItems: AIContextItem[] = [];
      const typesForCategory = AIContextMapping[request.category];
      const workspaceFolders = request.workspaceFolders ?? this.#workspaceFolders;
      if (!workspaceFolders.length) {
        this.#logger.debug(`No workspace folders detected.`);
      }

      const providerQuery = {
        ...request,
        workspaceFolders,
      };

      const availableProviders = await this.#getAvailableProviders();
      const contextItemsPromises = availableProviders
        .filter((p) => typesForCategory.includes(p.type))
        .map(async (provider) => {
          return provider.searchContextItems(providerQuery);
        });

      const contextItemsForAllProviders = await Promise.all(contextItemsPromises);
      contextItemsForAllProviders.forEach((items) => contextItems.push(...items));
      // TODO: add params to enable/disable the logic below
      // https://gitlab.com/gitlab-org/gitlab/-/issues/489466
      const selectedContextItemsSet = new Set(
        (await this.getSelectedContextItems())
          .map((item) => item?.id)
          .filter((id) => id !== undefined),
      );
      // Filter out the selected context items from the context items
      const nonSelectedItems = contextItems.filter((item) => !selectedContextItemsSet.has(item.id));

      const results = this.#disabledContextItemsToTheBack(nonSelectedItems);
      this.#logger.info(`context search query had ${results.length} results`);
      return results;
    } catch (e) {
      this.#logger.error(`error searching context items`, e);
      return [];
    }
  }

  #disabledContextItemsToTheBack(contextItems: AIContextItem[]) {
    return contextItems.sort((a, b) => {
      if (a.metadata?.enabled === b.metadata?.enabled) return 0;
      return a.metadata?.enabled ? -1 : 1;
    });
  }

  async getAvailableCategories(): Promise<AIContextCategory[]> {
    const availableProviders = await this.#getAvailableProviders();
    const types = availableProviders.map((provider) => provider.type);
    const categories = Object.keys(AIContextMapping) as AIContextCategory[];
    const availableCategories = types
      .map((type) =>
        categories.find((category) =>
          AIContextMapping[category].includes(type as AIContextProviderType),
        ),
      )
      .filter((category) => category !== undefined);

    this.#logger.info(
      `returning ${availableCategories.length} available context provider categories: "${availableCategories.join(', ')}"`,
    );

    return availableCategories;
  }

  /**
   * Retrieves context items with content for the given AI request.
   *
   * @deprecated - TODO: We are going to redesign the overall architecture to be modular at the feature level,
   * see https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/752#note_2310700284
   *
   */
  async retrieveContextItemsWithContent(
    request?: AIContextResolverRequest,
  ): Promise<AIContextItem[]> {
    const availableProviders = await this.#getAvailableProviders();
    const providersWithContext = await Promise.all(
      availableProviders.map(async (provider) => {
        try {
          return await provider.retrieveContextItemsWithContent(request);
        } catch (error) {
          this.#logger.error(
            `Error retrieving context items from provider type: ${provider.type}`,
            error,
          );
          return [];
        }
      }),
    );
    const contextItems = providersWithContext.flat().filter(Boolean);
    return Promise.all(contextItems.map((contextItem) => this.#transformItemContent(contextItem)));
  }

  async clearSelectedContextItems(): Promise<boolean> {
    this.#logger.info('clearing all selected context items');
    const availableProviders = await this.#getAvailableProviders();
    availableProviders.forEach((provider) => provider.clearSelectedContextItems());
    return true;
  }

  async getItemWithContent(item: AIContextItem): Promise<AIContextItem> {
    this.#logger.info(`received get context item content request ${item.id}`);
    const provider = await this.#getProviderForItem(item);
    const itemWithContent = await provider.getItemWithContent(item);
    this.#logger.info(`retrieved context item content ${itemWithContent}`);
    return this.#transformItemContent(itemWithContent);
  }

  async #transformItemContent(item: AIContextItem): Promise<AIContextItem> {
    try {
      return await this.#transformerService.transform(item);
    } catch (error) {
      // Since content transformation failed, we strip out the content completely.
      // This is to ensure we don't send sensitive values (e.g. because our secret redaction transformer failed)
      this.#logger.error(
        `Error transforming context item content. Item content will be excluded.`,
        error,
      );
      return {
        ...item,
        content: undefined,
      };
    }
  }

  async getProviderForType(type: AIContextProviderType): Promise<AIContextProvider> {
    const provider = this.#providers.find((p) => p.type === type);
    if (!provider) {
      throw new Error(`No provider found for type "${type}"`);
    }
    return provider;
  }
}
