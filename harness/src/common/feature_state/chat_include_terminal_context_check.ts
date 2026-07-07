import EventEmitter from 'events';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { CompositeDisposable, Disposable } from '@gitlab-org/disposable';
import { GitLabApiService, CHAT_INCLUDE_TERMINAL_CONTEXT_UNAVAILABLE } from '@gitlab-org/core';
import { DuoFeature, DuoFeatureAccessService } from '@gitlab-org/duo-feature-access';
import { StateCheck, StateCheckChangedEventData } from '@gitlab-org/feature-state';

export type ChatIncludeTerminalContextCheck = StateCheck<
  typeof CHAT_INCLUDE_TERMINAL_CONTEXT_UNAVAILABLE
>;

export const ChatIncludeTerminalContextCheck = createInterfaceId<ChatIncludeTerminalContextCheck>(
  'ChatIncludeTerminalContextCheck',
);

@Injectable(ChatIncludeTerminalContextCheck, [DuoFeatureAccessService, GitLabApiService])
export class DefaultChatIncludeTerminalContextCheck
  implements ChatIncludeTerminalContextCheck, Disposable
{
  #duoFeatureAccessService: DuoFeatureAccessService;

  #gitlabApiService: GitLabApiService;

  #enabled = false;

  #stateEmitter = new EventEmitter();

  #initialized = false;

  #disposables = new CompositeDisposable();

  constructor(
    duoFeatureAccessService: DuoFeatureAccessService,
    gitlabApiService: GitLabApiService,
  ) {
    this.#duoFeatureAccessService = duoFeatureAccessService;
    this.#gitlabApiService = gitlabApiService;

    this.#disposables.add(
      this.#gitlabApiService.onApiReconfigured(async () => {
        this.#initialized = false;
        await this.init();
      }),
    );
  }

  async init(): Promise<void> {
    if (this.#initialized) return;
    await this.#checkFeatureAvailability();
  }

  async #checkFeatureAvailability(): Promise<void> {
    const response = await this.#duoFeatureAccessService.isChatFeatureEnabled(
      DuoFeature.IncludeTerminalContext,
    );

    const previousValue = this.#enabled;
    this.#enabled = response;
    this.#initialized = true;

    if (previousValue !== response) {
      this.#stateEmitter.emit('change', {
        checkId: this.id,
        engaged: !this.#enabled,
        details: this.details,
      });
    }
  }

  onChanged(listener: (data: StateCheckChangedEventData) => void): Disposable {
    this.#stateEmitter.on('change', listener);

    const disposable = {
      dispose: () => this.#stateEmitter.removeListener('change', listener),
    };

    this.#disposables.add(disposable);

    return disposable;
  }

  get engaged() {
    return !this.#enabled;
  }

  id = CHAT_INCLUDE_TERMINAL_CONTEXT_UNAVAILABLE;

  details = 'Terminal context is not enabled for this user';

  dispose() {
    this.#disposables.dispose();
  }
}
