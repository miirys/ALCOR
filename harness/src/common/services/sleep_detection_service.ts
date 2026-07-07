import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import { LOG_LEVEL, Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';

export interface SleepDetectionService {}

export const SleepDetectionService =
  createInterfaceId<SleepDetectionService>('SleepDetectionService');

// how often we'll check
const INTERVAL_MS = 1000;

// the clock needs to be off by this much for us to consider the event a "wake up"
const SLEEP_THRESHOLD_MS = 3000;

@Injectable(SleepDetectionService, [ConfigService, Logger])
export class DefaultSleepDetectionService implements SleepDetectionService, Disposable {
  #logger: Logger;

  #subscriptions: Disposable[] = [];

  #lastTimestamp: number = 0;

  #activeCheck?: Disposable;

  constructor(configService: ConfigService, logger: Logger) {
    this.#logger = withPrefix(logger, '[SleepDetectionService]');

    this.#subscriptions.push(
      configService.onConfigChange((config) => {
        const { logLevel } = config;

        if (logLevel !== LOG_LEVEL.DEBUG) {
          this.#activeCheck?.dispose();
          this.#activeCheck = undefined;
          return;
        }

        if (!this.#activeCheck) {
          this.#lastTimestamp = Date.now();
          const interval = setInterval(this.detectSleep, INTERVAL_MS);
          this.#activeCheck = {
            dispose: () => clearInterval(interval),
          };
        }
      }),
    );
  }

  detectSleep = () => {
    const now = Date.now();
    const differenceMs = now - this.#lastTimestamp;
    if (differenceMs > SLEEP_THRESHOLD_MS) {
      this.#logger.debug(`System woke up from sleep after ${Math.floor(differenceMs / 1000)}s.`);
    }
    this.#lastTimestamp = now;
  };

  dispose() {
    this.#subscriptions.forEach((s) => s.dispose());
    this.#activeCheck?.dispose();
    this.#activeCheck = undefined;
  }
}
