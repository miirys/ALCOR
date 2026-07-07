import { Injectable, createInterfaceId } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import type { UpdateCheckResult } from '@gitlab-org/tui';

export interface IUpdateChecker {
  checkForUpdate(currentVersion: string): Promise<UpdateCheckResult>;
}

export const UpdateChecker = createInterfaceId<IUpdateChecker>('UpdateChecker');

@Injectable(UpdateChecker, [Logger])
export class DefaultUpdateChecker implements IUpdateChecker {
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[CliUpdateChecker]');
  }

  async checkForUpdate(currentVersion: string): Promise<UpdateCheckResult> {
    this.#logger.debug('Skipping update check');
    return {
      type: 'up-to-date',
      updateInfo: { currentVersion, latestVersion: currentVersion, installCommand: '' },
    };
  }
}
