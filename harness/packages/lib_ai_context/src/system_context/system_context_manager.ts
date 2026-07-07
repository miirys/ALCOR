import {
  collection,
  createCollectionId,
  Service,
  ServiceLifetime,
  Implements,
  createInterfaceId,
} from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { DuoFeatureAccessService } from '@gitlab-org/duo-feature-access';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import { AIContextItem } from '../index';
import { SystemContextProvider, WorkflowContext } from './system_context_provider';

export interface SystemContextManager {
  getSystemContextItems(context?: WorkflowContext): Promise<AIContextItem[]>;
  /** Called once on LSP `initialized`. Runs all providers. */
  precalculateOnInitialized(): Promise<void>;
  /** Called on each workflow start. Runs only providers with `precalculateOnWorkflowStart()` defined. */
  precalculateOnWorkflowStart(): Promise<void>;
}

export const SystemContextManager = createInterfaceId<SystemContextManager>('SystemContextManager');

export const SystemContextProviderCollection = createCollectionId(SystemContextProvider);

@Service({
  dependencies: [
    Logger,
    collection(SystemContextProvider),
    DuoFeatureAccessService,
    SecretRedactor,
  ],
  lifetime: ServiceLifetime.Singleton,
})
@Implements(SystemContextManager)
export class DefaultSystemContextManager implements SystemContextManager {
  readonly #providers: SystemContextProvider[] = [];

  readonly #duoFeatureAccessService: DuoFeatureAccessService;

  readonly #secretRedactor: SecretRedactor;

  readonly #logger: Logger;

  constructor(
    logger: Logger,
    providers: SystemContextProvider[],
    duoFeatureAccessService: DuoFeatureAccessService,
    secretRedactor: SecretRedactor,
  ) {
    this.#logger = withPrefix(logger, '[SystemContextManager]');
    this.#providers = providers;
    this.#duoFeatureAccessService = duoFeatureAccessService;
    this.#secretRedactor = secretRedactor;
  }

  async #getAvailableProviders(): Promise<SystemContextProvider[]> {
    const providerPromises = this.#providers.map(async (provider) => {
      const enabled = await this.#isEnabled(provider);
      return enabled ? provider : null;
    });
    const providers = await Promise.all(providerPromises);
    return providers.filter(Boolean) as SystemContextProvider[];
  }

  async #isEnabled(systemContextProvider: SystemContextProvider): Promise<boolean> {
    try {
      let enabled = true;

      if (systemContextProvider.chatRequiredFeature) {
        enabled = await this.#duoFeatureAccessService.isChatFeatureEnabled(
          systemContextProvider.chatRequiredFeature,
        );
        this.#logger.debug(
          `System provider with required feature "${systemContextProvider.chatRequiredFeature}": ${enabled}`,
        );
      } else {
        this.#logger.debug(`System provider has no feature requirement, enabled by default`);
      }

      return enabled;
    } catch (e) {
      this.#logger.warn(
        `Failed to get enabled status for system provider with required feature ${systemContextProvider.chatRequiredFeature} treating it as disabled.`,
        e,
      );
      return false;
    }
  }

  async precalculateOnInitialized(): Promise<void> {
    // Warm all providers regardless of feature flags -- the feature check happens too early
    // (before DuoFeatureAccessService has fetched available features from the server).
    // Feature gating is enforced at getSystemContextItems() time.
    await this.#runPrecalculate(this.#providers);
  }

  async precalculateOnWorkflowStart(): Promise<void> {
    const availableProviders = await this.#getAvailableProviders();
    const providers = availableProviders.filter(
      (p) => typeof p.precalculateOnWorkflowStart === 'function',
    );

    this.#logger.info(
      `Precalculating system context for ${providers.length} providers on workflow start`,
    );

    const precalculatePromises = providers.map(async (provider) => {
      if (typeof provider.precalculateOnWorkflowStart === 'function') {
        const providerName = provider.constructor.name;
        const startMs = Date.now();
        try {
          await provider.precalculateOnWorkflowStart();
          this.#logger.info(
            `[precalculateOnWorkflowStart] ${providerName} took ${Date.now() - startMs}ms`,
          );
        } catch (error) {
          this.#logger.warn(`Error precalculating for system context provider`, error);
        }
      }
    });

    await Promise.all(precalculatePromises);
    this.#logger.info(`System context precalculation complete for workflow start`);
  }

  async #runPrecalculate(providers: SystemContextProvider[]): Promise<void> {
    const providerNames = providers
      .filter((p) => 'precalculate' in p && typeof p.precalculate === 'function')
      .map((p) => p.constructor.name);
    this.#logger.info(
      `[precalculateOnInitialized] running for ${providerNames.length} providers: ${providerNames.join(', ')}`,
    );

    const precalculatePromises = providers.map(async (provider) => {
      if ('precalculate' in provider && typeof provider.precalculate === 'function') {
        const providerName = provider.constructor.name;
        const startMs = Date.now();
        try {
          await provider.precalculate();
          this.#logger.info(
            `[precalculateOnInitialized] ${providerName} took ${Date.now() - startMs}ms`,
          );
        } catch (error) {
          this.#logger.warn(`Error precalculating for system context provider`, error);
        }
      }
    });

    await Promise.all(precalculatePromises);
    this.#logger.info(`System context precalculation complete for initialized`);
  }

  async getSystemContextItems(context?: WorkflowContext): Promise<AIContextItem[]> {
    const availableProviders = await this.#getAvailableProviders();

    this.#logger.info(
      `[getSystemContextItems] running for ${availableProviders.length} providers: ${availableProviders.map((p) => p.constructor.name).join(', ')}`,
    );

    const providerPromises = availableProviders.map(async (provider) => {
      const providerName = provider.constructor.name;
      const startMs = Date.now();
      try {
        const items = await provider.getItems(context);
        this.#logger.info(`[getSystemContextItems] ${providerName} took ${Date.now() - startMs}ms`);
        return items;
      } catch (error) {
        this.#logger.error(`Error getting items from system context provider`, error);
        return [];
      }
    });

    const allContextItems = await Promise.all(providerPromises);
    const flattenedItems = allContextItems.flat();

    const redactedItems = flattenedItems.map((item) => this.#redactItem(item));

    this.#logger.info(`Retrieved ${redactedItems.length} system context items`);

    return redactedItems;
  }

  // Redact secrets from system context items before they are sent to the backend,
  // mirroring the redaction applied to user-attached context in ChatContextManager.
  #redactItem(item: AIContextItem): AIContextItem {
    if (!item.content) {
      return item;
    }

    try {
      return {
        ...item,
        content: this.#secretRedactor.redactSecrets(item.content, item.id),
      };
    } catch (error) {
      // If redaction fails, strip the content entirely so we never transmit
      // potentially unredacted secrets to the backend.
      this.#logger.error(
        `Error redacting system context item "${item.id}". Item content will be excluded.`,
        error as Error,
      );
      return {
        ...item,
        content: undefined,
      };
    }
  }
}
