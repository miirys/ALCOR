import {
  collection,
  createInterfaceId,
  Implements,
  Service,
  ServiceLifetime,
} from '@gitlab/needle';
import { type AIContextItem, AiContextTransformerService } from '@gitlab-org/ai-context';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import { DuoFeatureAccessService } from '@gitlab-org/duo-feature-access';
import { log } from '../log';
import {
  CodeSuggestionsAIRequest,
  SuggestionContextProvider,
} from './code_suggestions_context_provider';

export interface CodeSuggestionContextManager {
  searchContextItems: (aiRequest: CodeSuggestionsAIRequest) => Promise<AIContextItem[]>;
  addContentToItems(aiContextItems: AIContextItem[]): Promise<AIContextItem[]>;
}

export const CodeSuggestionContextManager = createInterfaceId<CodeSuggestionContextManager>(
  'CodeSuggestionContextManager',
);

@Service({
  dependencies: [
    Logger,
    ConfigService,
    AiContextTransformerService,
    collection(SuggestionContextProvider),
    DuoFeatureAccessService,
  ],
  lifetime: ServiceLifetime.Scoped,
})
@Implements(CodeSuggestionContextManager)
export class DefaultCodeSuggestionContextManager implements CodeSuggestionContextManager {
  readonly #providers: SuggestionContextProvider<AIContextItem>[] = [];

  readonly #transformerService: AiContextTransformerService;

  readonly #duoFeatureAccessService: DuoFeatureAccessService;

  readonly #logger: Logger;

  constructor(
    logger: Logger,
    _configService: ConfigService,
    aiContextTransformerService: AiContextTransformerService,
    providers: SuggestionContextProvider[],
    duoFeatureAccessService: DuoFeatureAccessService,
  ) {
    this.#logger = withPrefix(logger, 'DefaultCodeSuggestionContextManager');
    this.#transformerService = aiContextTransformerService;
    this.#providers = providers;
    this.#duoFeatureAccessService = duoFeatureAccessService;
  }

  async #getCodeSuggestionsProviders(): Promise<SuggestionContextProvider<AIContextItem>[]> {
    const providers = await Promise.all(
      this.#providers.map(async (provider) => {
        const isAvailable = await this.#duoFeatureAccessService.isSuggestionsFeatureEnabled(
          provider.suggestionsRequiredFeature,
        );
        return {
          provider,
          isAvailable,
        };
      }),
    ).then((results) =>
      results.filter((result) => result.isAvailable).map((result) => result.provider),
    );

    return providers;
  }

  async searchContextItems(request: CodeSuggestionsAIRequest): Promise<AIContextItem[]> {
    const providers = await this.#getCodeSuggestionsProviders();
    const contextItems = await Promise.all(
      providers.map((provider) => provider.searchSuggestionContextItems(request)),
    );
    return contextItems.flat();
  }

  async addContentToItems(aiContextItems: AIContextItem[]): Promise<AIContextItem[]> {
    const codeSuggestionProviders = await this.#getCodeSuggestionsProviders();
    const groupedItems = aiContextItems.reduce((acc, item) => {
      const itemType = item.metadata?.subType;
      const provider = codeSuggestionProviders.find((p) => p.type === itemType);

      if (provider) {
        const existingItems = acc.get(provider.type) ?? [];
        acc.set(provider.type, [...existingItems, item]);
      } else {
        log.error(`No provider found for type "${itemType}"`);
      }

      return acc;
    }, new Map<string, AIContextItem[]>());

    const providersWithContext = await Promise.all(
      codeSuggestionProviders.map((provider) =>
        provider.addContentToItems(groupedItems.get(provider.type) ?? []),
      ),
    );
    const contextItems = providersWithContext.flat().filter(Boolean);
    return Promise.all(contextItems.map((contextItem) => this.#transformItemContent(contextItem)));
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
}
