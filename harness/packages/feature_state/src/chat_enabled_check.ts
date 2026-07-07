/* eslint-disable max-classes-per-file */
import EventEmitter from 'events';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import { CHAT_DISABLED_BY_USER, FeatureStateCheck, StateCheckId } from '@gitlab-org/core';
import { ConfigService, ClientConfig } from '@gitlab-org/config';
import { StateCheck, StateCheckChangedEventData, StateConfigCheck } from './state_check';

const CHAT_DISABLED_DETAILS = 'Chat manually disabled.';

export const ChatEnabledConfigCheck = createInterfaceId<StateConfigCheck>('ChatEnabledConfigCheck');

@Injectable(ChatEnabledConfigCheck, [])
export class DefaultChatEnabledConfigCheck implements StateConfigCheck {
  async validate(config: ClientConfig): Promise<FeatureStateCheck<StateCheckId> | undefined> {
    return {
      checkId: CHAT_DISABLED_BY_USER,
      details: CHAT_DISABLED_DETAILS,
      engaged: config.duoChat?.enabled === false,
    };
  }
}

export type ChatEnabledCheck = StateCheck<typeof CHAT_DISABLED_BY_USER> & StateConfigCheck;

export const ChatEnabledCheck = createInterfaceId<ChatEnabledCheck>('ChatEnabledCheck');

@Injectable(ChatEnabledCheck, [ConfigService])
export class DefaultChatEnabledCheck implements ChatEnabledCheck {
  #configCheck = new DefaultChatEnabledConfigCheck();

  #subscriptions: Disposable[] = [];

  #stateEmitter = new EventEmitter();

  #isEnabledByUser = true;

  constructor(configService: ConfigService) {
    this.#subscriptions.push(
      configService.onConfigChange((config) => {
        const duoChatEnabled = config.duoChat?.enabled;

        if (duoChatEnabled !== undefined) {
          this.#isEnabledByUser = duoChatEnabled;
          this.#stateEmitter.emit('change', this);
        }
      }),
    );
  }

  id = CHAT_DISABLED_BY_USER;

  details = CHAT_DISABLED_DETAILS;

  get engaged() {
    return !this.#isEnabledByUser;
  }

  onChanged(listener: (data: StateCheckChangedEventData) => void): Disposable {
    this.#stateEmitter.on('change', listener);

    return {
      dispose: () => this.#stateEmitter.removeListener('change', listener),
    };
  }

  dispose() {
    this.#subscriptions.forEach((s) => s.dispose());
  }

  validate(config: ClientConfig): Promise<FeatureStateCheck<StateCheckId> | undefined> {
    return this.#configCheck.validate(config);
  }
}
