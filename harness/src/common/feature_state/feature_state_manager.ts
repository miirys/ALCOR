import { Disposable } from '@gitlab-org/disposable';
import { Injectable } from '@gitlab/needle';
import {
  FeatureStateNotificationParams,
  FeatureStateManager,
  FeatureState,
  CHECKS_PER_FEATURE,
  StateCheckId,
  NotifyFn,
  EventEmitterImpl,
  diffEmitter,
  STATE_CHECK_USER_READABLE_LABELS,
  STATE_CHECK_DISABLED_LABELS,
} from '@gitlab-org/core';
import {
  AgentPlatformEnabledCheck,
  AuthenticationRequiredCheck,
  ChatEnabledCheck,
  CodeSuggestionsEnabledCheck,
  FlowsInstanceFlagCheck,
  StateCheck,
} from '@gitlab-org/feature-state';
import {
  SandboxDisabledByUserCheck,
  SandboxUnsupportedPlatformCheck,
  SandboxMissingDependenciesCheck,
} from '@gitlab-org/sandbox/feature-state';
import { getEntries } from '../utils/get_entries';
import { log } from '../log';
import { ChatIncludeTerminalContextCheck } from './chat_include_terminal_context_check';
import { CodeSuggestionsSupportedLanguageCheck } from './supported_language_check';
import { CodeSuggestionsFileExclusionCheck } from './file_exclusion_check';
import { ProjectDuoAccessCheck } from './project_duo_acces_check';
import { CodeSuggestionsDuoLicenseCheck } from './code_suggestions_duo_license_check';
import { CodeSuggestionsInstanceVersionCheck } from './minimal_gitlab_version_for_code_suggestions_check';
import { ClassicChatLicenseCheck } from './classic_chat_license_check';
import { DuoChatLicenseCheck } from './duo_chat_license_check';
import { SuggestionApiErrorCheck } from './suggestion_api_error_check';
import { AgenticChatSupportCheck } from './agentic_chat/agentic_chat_support_check';
import { CodeSuggestionsCreditsCheck } from './code_suggestions_credits_check';
import { CodeSuggestionsMissingDefaultNamespaceCheck } from './code_suggestions_missing_default_namespace_check';

const formatEngagedSummary = (state: FeatureState[]): string =>
  state
    .map((f) => `${f.featureId}: [${f.engagedChecks.map((c) => c.checkId).join(', ')}]`)
    .join('; ');

const sortChecksInPriority = (
  orderedChecks: StateCheckId[],
  unorderedChecks: StateCheck<StateCheckId>[],
): StateCheck<StateCheckId>[] => {
  return orderedChecks
    .map((checkId) => unorderedChecks.find((check) => check.id === checkId))
    .filter((check): check is StateCheck<StateCheckId> => check !== undefined);
};

@Injectable(FeatureStateManager, [
  SuggestionApiErrorCheck,
  AuthenticationRequiredCheck,
  CodeSuggestionsInstanceVersionCheck,
  CodeSuggestionsDuoLicenseCheck,
  ProjectDuoAccessCheck,
  CodeSuggestionsFileExclusionCheck,
  CodeSuggestionsSupportedLanguageCheck,
  ChatEnabledCheck,
  ChatIncludeTerminalContextCheck,
  CodeSuggestionsEnabledCheck,
  CodeSuggestionsMissingDefaultNamespaceCheck,
  CodeSuggestionsCreditsCheck,
  ClassicChatLicenseCheck,
  DuoChatLicenseCheck,
  AgentPlatformEnabledCheck,
  AgenticChatSupportCheck,
  FlowsInstanceFlagCheck,
  SandboxDisabledByUserCheck,
  SandboxUnsupportedPlatformCheck,
  SandboxMissingDependenciesCheck,
])
export class DefaultFeatureStateManager implements FeatureStateManager {
  #checks: StateCheck<StateCheckId>[] = [];

  #subscriptions: Disposable[] = [];

  #notify?: NotifyFn<FeatureStateNotificationParams>;

  #precomputedSortedChecks: Map<string, StateCheck<StateCheckId>[]> = new Map();

  #engagedChecksSet: Set<StateCheckId> = new Set();

  #eventEmitter = diffEmitter(new EventEmitterImpl<FeatureState[]>());

  #notifyEmitter = diffEmitter(new EventEmitterImpl<FeatureState[]>());

  constructor(
    suggestionApiErrorCheck: SuggestionApiErrorCheck,
    authenticationRequiredCheck: AuthenticationRequiredCheck,
    codeSuggestionsInstanceVersionCheck: CodeSuggestionsInstanceVersionCheck,
    codeSuggestionsDuoLicenseCheck: CodeSuggestionsDuoLicenseCheck,
    projectDuoAccessCheck: ProjectDuoAccessCheck,
    fileExclusionCheck: CodeSuggestionsFileExclusionCheck,
    supportedLanguagePolicy: CodeSuggestionsSupportedLanguageCheck,
    chatEnabledCheck: ChatEnabledCheck,
    chatIncludeTerminalContextCheck: ChatIncludeTerminalContextCheck,
    codeSuggestionsEnabledCheck: CodeSuggestionsEnabledCheck,
    codeSuggestionsMissingDefaultNamespaceCheck: CodeSuggestionsMissingDefaultNamespaceCheck,
    codeSuggestionsCreditCheck: CodeSuggestionsCreditsCheck,
    classicChatLicenseCheck: ClassicChatLicenseCheck,
    duoChatLicenseCheck: DuoChatLicenseCheck,
    agentPlatformEnabledCheck: AgentPlatformEnabledCheck,
    agenticChatSupportCheck: AgenticChatSupportCheck,
    flowsInstanceFlagCheck: FlowsInstanceFlagCheck,
    sandboxDisabledByUserCheck: SandboxDisabledByUserCheck,
    sandboxUnsupportedPlatformCheck: SandboxUnsupportedPlatformCheck,
    sandboxMissingDependenciesCheck: SandboxMissingDependenciesCheck,
  ) {
    this.#checks.push(
      authenticationRequiredCheck,
      codeSuggestionsInstanceVersionCheck,
      codeSuggestionsDuoLicenseCheck,
      projectDuoAccessCheck,
      fileExclusionCheck,
      supportedLanguagePolicy,
      chatEnabledCheck,
      chatIncludeTerminalContextCheck,
      codeSuggestionsEnabledCheck,
      classicChatLicenseCheck,
      duoChatLicenseCheck,
      suggestionApiErrorCheck,
      codeSuggestionsMissingDefaultNamespaceCheck,
      codeSuggestionsCreditCheck,
      agentPlatformEnabledCheck,
      agenticChatSupportCheck,
      flowsInstanceFlagCheck,
      sandboxDisabledByUserCheck,
      sandboxUnsupportedPlatformCheck,
      sandboxMissingDependenciesCheck,
    );

    // Precompute sorted checks for each feature
    getEntries(CHECKS_PER_FEATURE).forEach(([featureId, orderedFeatureStateChecks]) => {
      const sortedChecks = sortChecksInPriority(orderedFeatureStateChecks, this.#checks);
      this.#precomputedSortedChecks.set(featureId, sortedChecks);
    });
  }

  async init(notify: NotifyFn<FeatureStateNotificationParams>): Promise<void> {
    this.#notify = notify;

    // initialize the engaged checks with default values
    this.#engagedChecksSet = new Set(this.#checks.filter((c) => c.engaged).map((c) => c.id));

    // Seed the notifyEmitter with the initial state so that diffEmitter has a baseline
    // and won't fire for subsequent check changes that don't alter the state.
    // This must happen before registering the listener to avoid notifying the client during init.
    this.#notifyEmitter.fire(this.#state);

    this.#subscriptions.push(
      this.#notifyEmitter.event(async (state) => {
        try {
          log.debug(
            `Feature state changed, notifying client of engaged checks — ${formatEngagedSummary(state)}`,
          );
          await this.#notify?.(state);
        } catch (e) {
          log.error('Failed to send feature state notification', e);
        }
      }),
    );

    this.#subscriptions.push(
      ...this.#checks.map((check) =>
        check.onChanged(async () => {
          if (check.engaged) {
            this.#engagedChecksSet.add(check.id);
          } else {
            this.#engagedChecksSet.delete(check.id);
          }
          this.#notifyEmitter.fire(this.#state);
          this.#eventEmitter.fire(this.#state);
        }),
      ),
    );

    try {
      await Promise.all(this.#checks.filter((c) => Boolean(c.init)).map((c) => c.init?.()));
    } catch (e) {
      log.error('Failed to initialize some feature state checks', e);
    }
  }

  get onChange() {
    return (listener: (e: FeatureState[]) => unknown): Disposable => {
      const disposable = this.#eventEmitter.event(listener);

      listener(this.#state);

      return disposable;
    };
  }

  dispose() {
    this.#subscriptions.forEach((s) => s.dispose());
  }

  get #state(): FeatureState[] {
    return getEntries(CHECKS_PER_FEATURE).map(([featureId]) => {
      const sortedChecks = this.#precomputedSortedChecks.get(featureId) || [];

      const engagedFeatureChecks = sortedChecks
        .filter((check) => this.#engagedChecksSet.has(check.id))
        .map((check) => ({
          checkId: check.id,
          label: STATE_CHECK_USER_READABLE_LABELS[check.id],
          disabledLabel: STATE_CHECK_DISABLED_LABELS[check.id],
          details: check.details,
          context: check.context,
          engaged: true,
        }));

      const allFeatureChecks = sortedChecks.map((check) => ({
        checkId: check.id,
        label: STATE_CHECK_USER_READABLE_LABELS[check.id],
        disabledLabel: STATE_CHECK_DISABLED_LABELS[check.id],
        details: check.details,
        context: check.context,
        engaged: this.#engagedChecksSet.has(check.id),
      }));

      return {
        featureId,
        engagedChecks: engagedFeatureChecks,
        allChecks: allFeatureChecks,
      };
    });
  }
}
