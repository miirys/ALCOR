import { collection, createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import {
  AIContextProvider,
  AiContextTransformerService,
  ChatContextManager,
  DefaultChatContextManager,
} from '@gitlab-org/ai-context';
import { DuoFeatureAccessService } from '@gitlab-org/duo-feature-access';
/** Activation characters that prefix context item references in the prompt text. */
const CONTEXT_ACTIVATION_CHARS = ['@'];

export interface CliContextManager extends ChatContextManager {
  syncWithTextBuffer(text: string): Promise<void>;
}

export const CliContextManager = createInterfaceId<CliContextManager>('CliContextManager');

@Injectable(CliContextManager, [
  Logger,
  ConfigService,
  AiContextTransformerService,
  collection(AIContextProvider),
  DuoFeatureAccessService,
])
export class DefaultCliContextManager
  extends DefaultChatContextManager
  implements CliContextManager
{
  #syncLogger: Logger;

  constructor(
    logger: Logger,
    configService: ConfigService,
    aiContextTransformerService: AiContextTransformerService,
    providers: AIContextProvider[],
    duoFeatureAccessService: DuoFeatureAccessService,
  ) {
    super(logger, configService, aiContextTransformerService, providers, duoFeatureAccessService);
    this.#syncLogger = withPrefix(logger, '[CliContextManager]');
  }

  /**
   * Given some text value from the TUI prompt input, removes any items that are no longer part
   * of the users prompt. This means if a user adds a context item `@foo/bar.ts` and then deletes
   * part of that string `@foo/bar.` we no longer match the item and remove it from selections
   */
  async syncWithTextBuffer(text: string): Promise<void> {
    const referencesInText = this.#findReferencesInText(text);
    const referenceIdentifiers = new Set(referencesInText);

    const selectedItems = await this.getSelectedContextItems();

    const itemsToRemove = selectedItems
      .map((item) => {
        const itemReference = item.metadata.secondaryText;
        if (referenceIdentifiers.has(itemReference)) return undefined;

        return { item, itemReference };
      })
      .filter((entry) => entry !== undefined);

    await Promise.all(
      itemsToRemove.map(({ item, itemReference }) => {
        this.#syncLogger.debug(`Removing item no longer in text: ${itemReference}`);
        return this.removeSelectedContextItem(item);
      }),
    );
  }

  /**
   * Finds all context references in text. Supports unquoted (`@foo.ts`) and
   * quoted (`@"path with spaces"`) formats. Unclosed quotes are discarded.
   * Returns the full reference including the activation character (e.g., `@foo.ts`).
   */
  #findReferencesInText(text: string): string[] {
    const results: string[] = [];

    for (const activationChar of CONTEXT_ACTIVATION_CHARS) {
      let i = 0;

      while (i < text.length) {
        if (text[i] === activationChar) {
          const rest = text.slice(i + 1);

          if (rest.startsWith('"')) {
            const endQuote = rest.indexOf('"', 1);
            if (endQuote !== -1) {
              const path = rest.slice(1, endQuote);
              results.push(`${activationChar}"${path}"`);
              i += endQuote + 2;
            } else {
              i++;
            }
          } else {
            const endIndex = rest.search(/\s/);
            const value = endIndex === -1 ? rest : rest.slice(0, endIndex);
            if (value.length > 0) {
              results.push(`${activationChar}${value}`);
              i += value.length + 1;
            } else {
              i++;
            }
          }
        } else {
          i++;
        }
      }
    }

    return results;
  }
}
