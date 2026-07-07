import EventEmitter from 'events';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import { SANDBOX_DISABLED_BY_USER } from '@gitlab-org/core';
import { ConfigService } from '@gitlab-org/config';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { SandboxStateCheck, SandboxStateCheckChangedEventData } from './state_check';

export type SandboxDisabledByUserCheck = SandboxStateCheck<typeof SANDBOX_DISABLED_BY_USER>;

export const SandboxDisabledByUserCheck = createInterfaceId<SandboxDisabledByUserCheck>(
  'SandboxDisabledByUserCheck',
);

@Injectable(SandboxDisabledByUserCheck, [ConfigService, Logger])
export class DefaultSandboxDisabledByUserCheck implements SandboxDisabledByUserCheck, Disposable {
  readonly id = SANDBOX_DISABLED_BY_USER;

  #logger: Logger;

  #subscriptions: Disposable[] = [];

  #stateEmitter = new EventEmitter();

  #configService: ConfigService;

  #enabled: boolean;

  constructor(configService: ConfigService, logger: Logger) {
    this.#configService = configService;
    this.#logger = withPrefix(logger, '[SandboxDisabledByUserCheck]');
    this.#enabled = this.#readEnabled();

    this.#subscriptions.push(
      configService.onConfigChange(() => {
        const nextEnabled = this.#readEnabled();
        if (nextEnabled === this.#enabled) return;

        this.#enabled = nextEnabled;
        this.#logger.debug(`Sandbox enabled changed: ${this.#enabled}`);
        this.#stateEmitter.emit('change', {
          checkId: this.id,
          engaged: this.engaged,
          details: this.details,
        });
      }),
    );
  }

  #readEnabled(): boolean {
    return this.#configService.get('duo.sandbox.enabled') ?? false;
  }

  get engaged(): boolean {
    return !this.#enabled;
  }

  get details(): string {
    return this.engaged
      ? 'Process sandboxing is disabled. Enable duo.sandbox.enabled to opt in.'
      : 'Process sandboxing is enabled.';
  }

  onChanged(listener: (data: SandboxStateCheckChangedEventData) => void): Disposable {
    this.#stateEmitter.on('change', listener);
    return {
      dispose: () => this.#stateEmitter.removeListener('change', listener),
    };
  }

  dispose(): void {
    this.#subscriptions.forEach((s) => s.dispose());
    this.#subscriptions = [];
  }
}
