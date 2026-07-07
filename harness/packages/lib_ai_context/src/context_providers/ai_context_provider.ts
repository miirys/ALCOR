import z from 'zod';
import { createInterfaceId } from '@gitlab/needle';
import { DuoFeature } from '@gitlab-org/duo-feature-access';
import { Logger } from '@gitlab-org/logging';
import { AIContextItem } from '../ai_context_item';
import { AIContextPolicyResponse, AIContextResolverRequest, DuoChatAIRequest } from '../index';

export type AIContextProviderType =
  | 'open_tab'
  | 'import'
  | 'local_file_search'
  | 'issue'
  | 'merge_request'
  | 'snippet'
  | 'dependency'
  | 'local_git'
  | 'user_rule'
  | 'repository'
  | 'directory'
  | 'shell'
  | 'os'
  | 'mode'
  | 'hook';

export const AIContextProviderTypeSchema = z.enum([
  'open_tab',
  'import',
  'local_file_search',
  'issue',
  'merge_request',
  'snippet',
  'dependency',
  'local_git',
  'user_rule',
  'repository',
  'directory',
  'shell',
  'os',
  'mode',
  'hook',
]);

export interface AIContextProvider<T extends AIContextItem = AIContextItem> {
  type: AIContextProviderType;
  readonly chatRequiredFeature: DuoFeature;
  addSelectedContextItem: (contextItem: T) => Promise<void>;
  removeSelectedContextItem: (id: string) => Promise<void>;
  clearSelectedContextItems: () => Promise<void>;
  getSelectedContextItems: () => Promise<T[]>;
  searchContextItems: (query: DuoChatAIRequest) => Promise<T[]>;
  retrieveContextItemsWithContent: (request?: AIContextResolverRequest | null) => Promise<T[]>;
  getItemWithContent: (item: T) => Promise<T>;
}

// Generic AIContextProvider interface ID cannot handle contravariant parameters and covariant returns properly in DI registration
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AIContextProvider = createInterfaceId<AIContextProvider<any>>('AIContextProvider');

export abstract class AbstractAIContextProvider<T extends AIContextItem>
  implements AIContextProvider<T>
{
  #selectedContextItems: T[] = [];

  type: AIContextProviderType;

  protected logger: Logger;

  /**
   * If set, the provider will be enabled only if the current user has the specified feature enabled.
   * If not set, the provider will always be available
   */
  abstract readonly chatRequiredFeature: DuoFeature;

  protected onContextItemAdded?: (contextItem: T) => void;

  protected onBeforeContextItemRemoved?: (contextItem: T) => void;

  protected onBeforeAllContextItemsRemoved?: () => void;

  protected canItemBeAdded?: (contextItem: T) => Promise<AIContextPolicyResponse>;

  constructor(type: AIContextProviderType = 'open_tab', logger: Logger) {
    this.#selectedContextItems = [];
    this.type = type;
    this.logger = logger;
  }

  protected notifyContextItemAdded(contextItem: T): void {
    if (this.onContextItemAdded) {
      this.onContextItemAdded(contextItem);
    }
  }

  protected notifyContextItemToBeRemoved(contextItem: T): void {
    if (this.onBeforeContextItemRemoved) {
      this.onBeforeContextItemRemoved(contextItem);
    }
  }

  protected notifyAllContextItemsToBeRemoved(): void {
    if (this.onBeforeAllContextItemsRemoved) {
      this.onBeforeAllContextItemsRemoved();
    }
  }

  protected async itemAllowedByPolicies(contextItem: T): Promise<AIContextPolicyResponse> {
    if (this.canItemBeAdded) {
      return this.canItemBeAdded(contextItem);
    }
    return Promise.resolve({
      enabled: true,
    });
  }

  #findItemWithId(id: string): T | undefined {
    return this.#selectedContextItems.find((item) => item.id === id);
  }

  async addSelectedContextItem(contextItem: T): Promise<void> {
    const canBeAdded = await this.itemAllowedByPolicies(contextItem);
    if (!canBeAdded) {
      this.logger.error(
        `Context item is not allowed by context policies: ${JSON.stringify(contextItem)}`,
      );

      return;
    }
    if (contextItem.metadata.subType !== this.type) {
      this.logger.error(
        `Context item type "${contextItem.metadata.subType}" does not match context provider type "${this.type}"`,
      );
    } else if (this.#findItemWithId(contextItem.id)) {
      this.logger.error(`Context item with ID "${contextItem.id}" already exists`);
    } else {
      this.#selectedContextItems.push(contextItem);
      this.notifyContextItemAdded(contextItem);
    }
  }

  async removeSelectedContextItem(id: string): Promise<void> {
    const item = this.#selectedContextItems.find((i) => i.id === id);
    if (!item) {
      const error = new Error(`Item with id ${id} not found in context items.`);
      this.logger.error(error);
      throw error;
    }
    this.notifyContextItemToBeRemoved(item);
    const index = this.#selectedContextItems.indexOf(item);
    this.#selectedContextItems.splice(index, 1);
  }

  async clearSelectedContextItems(): Promise<void> {
    if (this.#selectedContextItems.length) {
      this.notifyAllContextItemsToBeRemoved();
      this.#selectedContextItems = [];
    }
  }

  async getSelectedContextItems(): Promise<T[]> {
    return this.#selectedContextItems;
  }

  abstract searchContextItems(query: DuoChatAIRequest): Promise<T[]>;

  abstract retrieveContextItemsWithContent(): Promise<T[]>;

  abstract getItemWithContent(item: T): Promise<T>;
}
