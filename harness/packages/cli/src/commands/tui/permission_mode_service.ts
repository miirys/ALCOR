import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import type { PermissionMode } from '@gitlab-org/tui';
import { ParsedCliInput } from '../../parse';

export type { PermissionMode };

/**
 * Session-scoped tool-approval mode.
 *
 * In 'auto' mode, tool calls awaiting approval are approved automatically
 * (scope 'once') instead of prompting the user — comparable to auto-accept
 * modes in other agent CLIs. The mode is seeded from the `--auto` flag and
 * can be toggled at runtime via the `/auto` slash command.
 */
export interface PermissionModeService {
  getMode(): PermissionMode;
  setMode(mode: PermissionMode): void;
  isAuto(): boolean;
  /** Flips between 'default' and 'auto', returning the new mode. */
  toggle(): PermissionMode;
}

export const PermissionModeService =
  createInterfaceId<PermissionModeService>('PermissionModeService');

@Implements(PermissionModeService)
@Service({
  dependencies: [Logger, ParsedCliInput],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultPermissionModeService implements PermissionModeService {
  #logger: Logger;

  #mode: PermissionMode;

  constructor(logger: Logger, cliInput: ParsedCliInput) {
    this.#logger = withPrefix(logger, '[PermissionModeService]');
    this.#mode = cliInput.command.name === 'tui' && cliInput.command.auto ? 'auto' : 'default';
    if (this.#mode === 'auto') {
      this.#logger.info(
        'Starting in auto mode (--auto): tool calls will be approved automatically',
      );
    }
  }

  getMode(): PermissionMode {
    return this.#mode;
  }

  setMode(mode: PermissionMode): void {
    if (mode === this.#mode) return;
    this.#mode = mode;
    this.#logger.info(`Permission mode changed to '${mode}'`);
  }

  isAuto(): boolean {
    return this.#mode === 'auto';
  }

  toggle(): PermissionMode {
    this.setMode(this.#mode === 'auto' ? 'default' : 'auto');
    return this.#mode;
  }
}
