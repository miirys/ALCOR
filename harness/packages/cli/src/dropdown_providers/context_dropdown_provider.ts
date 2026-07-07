import { Injectable } from '@gitlab/needle';
import type { AIContextItem } from '@gitlab-org/ai-context';
import {
  DropdownProvider,
  getWordAtCursor,
  type CursorPosition,
  type DropdownItem,
} from '@gitlab-org/tui';
import { CliContextManager } from '../ai_context/cli_ai_context_manager';

/**
 * Provides file context items for the `@` trigger in the text input dropdown.
 */
@Injectable(DropdownProvider, [CliContextManager])
export class ContextDropdownProvider implements DropdownProvider {
  id = 'context';

  #aiContextManager: CliContextManager;

  #lastResults = new Map<string, AIContextItem>();

  constructor(aiContextManager: CliContextManager) {
    this.#aiContextManager = aiContextManager;
  }

  async getItems(text: string, position: CursorPosition): Promise<DropdownItem[]> {
    const word = getWordAtCursor(text, position);
    if (!word.startsWith('@')) return [];

    const query = word.substring(1);
    const results =
      (await this.#aiContextManager?.searchContextItems({ category: 'file', query })) ?? [];

    this.#lastResults.clear();
    for (const item of results) {
      this.#lastResults.set(item.id, item);
    }

    return results.map(
      (item): DropdownItem => ({
        id: item.id,
        label: item.metadata.title,
        enabled: item.metadata.enabled !== false,
        disabledReason: item.metadata.disabledReasons?.[0],
        replaceWith: `${item.metadata.secondaryText} `,
      }),
    );
  }

  async onItemSelected(item: DropdownItem): Promise<void> {
    const contextItem = this.#lastResults.get(item.id);
    if (contextItem) {
      await this.#aiContextManager?.addSelectedContextItem(contextItem);
    }
  }
}
