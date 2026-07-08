import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger } from '@gitlab-org/logging';
import {
  UserPersistentStorage,
  SELECTED_ANTHROPIC_MODEL_STORAGE_KEY,
} from '@gitlab-org/persistent-storage';
import { AvailableModelsResult, ModelManager, SelectedModel } from '../../model_manager';
import { BaseModelManager } from '../../base_model_manager';
import { SupportedAnthropicModel } from '../../backend_option_defs';
import { ProviderRegistry } from '../../providers/provider_registry';
import { AnthropicParsedOptions } from './anthropic_parsed_options';

const ANTHROPIC_NAME_BY_REF: Record<SupportedAnthropicModel, string> = {
  [SupportedAnthropicModel.ClaudeSonnet4]: 'Claude Sonnet 4',
  [SupportedAnthropicModel.ClaudeSonnet45]: 'Claude Sonnet 4.5',
  [SupportedAnthropicModel.ClaudeOpus45]: 'Claude Opus 4.5',
  [SupportedAnthropicModel.ClaudeHaiku45]: 'Claude Haiku 4.5',
};

const ANTHROPIC_MODELS: AvailableModelsResult['models'] = Object.entries(ANTHROPIC_NAME_BY_REF).map(
  ([ref, name]) => ({ ref, name }),
);

@Implements(ModelManager)
@Service({
  dependencies: [AnthropicParsedOptions, UserPersistentStorage, Logger],
  lifetime: ServiceLifetime.Singleton,
})
export class AnthropicModelManager extends BaseModelManager {
  constructor(
    opts: AnthropicParsedOptions,
    userPersistentStorage: UserPersistentStorage,
    logger: Logger,
  ) {
    const initialModel = opts.model
      ? {
          modelRef: opts.model,
          modelName: ANTHROPIC_NAME_BY_REF[opts.model as SupportedAnthropicModel] ?? opts.model,
        }
      : undefined;
    super(initialModel, userPersistentStorage, SELECTED_ANTHROPIC_MODEL_STORAGE_KEY, logger);
  }

  getFallbackModel(): SelectedModel {
    // A logged-in direct provider's active model wins over the GitLab-proxy
    // default, so a fresh session lands on what the user picked at /login.
    const active = new ProviderRegistry().getActive();
    if (active) {
      return { modelRef: active.model, modelName: active.model };
    }
    return {
      modelRef: SupportedAnthropicModel.ClaudeSonnet45,
      modelName: ANTHROPIC_NAME_BY_REF[SupportedAnthropicModel.ClaudeSonnet45],
    };
  }

  getAvailableModels(): Promise<AvailableModelsResult> {
    const registry = new ProviderRegistry();
    const active = registry.getActive();
    if (active) {
      const provider = registry.getProvider(active.providerId);
      const models = provider?.models ?? [];
      const list = (models.length > 0 ? models : [active.model]).map((ref) => ({
        ref,
        name: ref,
      }));
      return Promise.resolve({ models: list });
    }
    return Promise.resolve({ models: ANTHROPIC_MODELS });
  }
}
