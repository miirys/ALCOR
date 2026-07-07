import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  UserPersistentStorage,
  SELECTED_CHAT_MODEL_STORAGE_KEY,
} from '@gitlab-org/persistent-storage';
import { WorkflowRunner } from '@gitlab-lsp/workflow-api';
import { WorkflowRailsService } from '@gitlab-org/workflow-executor';
import { ConfigService } from '@gitlab-org/config';
import { AvailableModelsResult, ModelManager, SelectedModel } from '../../model_manager';
import { BaseModelManager } from '../../base_model_manager';
import { GitLabParsedOptions } from './gitlab_parsed_options';

const GITLAB_FALLBACK_MODEL_REF = 'claude_sonnet_4_6';
const GITLAB_FALLBACK_MODEL_NAME = 'Claude Sonnet 4.6';

@Implements(ModelManager)
@Service({
  dependencies: [
    GitLabParsedOptions,
    UserPersistentStorage,
    WorkflowRailsService,
    WorkflowRunner,
    ConfigService,
    Logger,
  ],
  lifetime: ServiceLifetime.Singleton,
})
export class GitLabModelManager extends BaseModelManager {
  #workflowRailsService: WorkflowRailsService;

  #workflowRunner: WorkflowRunner;

  #configService: ConfigService;

  #logger: Logger;

  /** Server-resolved model metadata JSON (DUO_WORKFLOW_METADATA.modelMetadata), if provided. */
  #serverModelMetadata: string | undefined;

  get #rootNamespaceId(): string {
    return this.#configService.get('rootNamespaceId') ?? '';
  }

  constructor(
    opts: GitLabParsedOptions,
    userPersistentStorage: UserPersistentStorage,
    workflowRailsService: WorkflowRailsService,
    workflowRunner: WorkflowRunner,
    configService: ConfigService,
    logger: Logger,
  ) {
    const initialModel = opts.model ? { modelRef: opts.model, modelName: opts.model } : undefined;
    super(initialModel, userPersistentStorage, SELECTED_CHAT_MODEL_STORAGE_KEY, logger);
    this.#workflowRailsService = workflowRailsService;
    this.#workflowRunner = workflowRunner;
    this.#configService = configService;
    this.#logger = withPrefix(logger, '[GitLabModelManager]');

    const modelMetadata = opts.duoWorkflowMetadata?.modelMetadata;
    this.#serverModelMetadata = typeof modelMetadata === 'string' ? modelMetadata : undefined;
  }

  getFallbackModel(): SelectedModel {
    return { modelRef: GITLAB_FALLBACK_MODEL_REF, modelName: GITLAB_FALLBACK_MODEL_NAME };
  }

  /**
   * Resolves the model ref against the server (normalizing aliases) and looks up
   * the friendly display name from the available models list. Both network calls
   * run in parallel; a failure in either degrades gracefully.
   */
  async resolveModel(): Promise<void> {
    this.#logModelForRun();

    const [resolvedResult, availableModelsResult] = await Promise.allSettled([
      this.#workflowRunner.resolveModel(this.getModel().modelRef, this.#rootNamespaceId),
      this.getAvailableModels(),
    ]);

    const current = this.getModel();
    const resolved = resolvedResult.status === 'fulfilled' ? resolvedResult.value : undefined;
    const models =
      availableModelsResult.status === 'fulfilled' ? availableModelsResult.value.models : [];

    const finalRef = resolved ?? current.modelRef;
    const friendlyName = models.find((m) => m.ref === finalRef)?.name ?? current.modelName;

    if (finalRef !== current.modelRef || friendlyName !== current.modelName) {
      this.setModel({ modelRef: finalRef, modelName: friendlyName });
    }
  }

  /**
   * Logs the model the server resolved for this run (from
   * DUO_WORKFLOW_METADATA.modelMetadata), not the client-side fallback, so
   * customers can confirm which model ran from the runner/session logs.
   */
  #logModelForRun(): void {
    if (!this.#serverModelMetadata) return;

    let meta: Record<string, unknown>;
    try {
      meta = JSON.parse(this.#serverModelMetadata) as Record<string, unknown>;
    } catch {
      return;
    }

    const str = (value: unknown): string => (typeof value === 'string' ? value : 'unknown');
    const model =
      typeof meta.identifier === 'string' && meta.identifier !== ''
        ? `"${meta.identifier}"`
        : `GitLab default for feature "${str(meta.feature_setting)}"`;

    this.#logger.info(
      `Model for this run: ${model} (provider: ${str(meta.provider)}, feature: ${str(meta.feature_setting)})`,
    );
  }

  async getAvailableModels(): Promise<AvailableModelsResult> {
    const response = await this.#workflowRailsService.getAiChatAvailableModels({
      rootNamespaceId: this.#rootNamespaceId,
    });
    const available = response?.aiChatAvailableModels;

    return {
      models: (available?.selectableModels ?? []).map((m) => ({ ref: m.ref, name: m.name })),
    };
  }
}
