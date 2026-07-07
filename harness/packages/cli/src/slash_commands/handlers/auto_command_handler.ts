import { Logger, withPrefix } from '@gitlab-org/logging';
import { Injectable } from '@gitlab/needle';
import type { ControllerApi } from '../../commands/tui/controller_api';
import {
  PermissionModeService,
  type PermissionMode,
} from '../../commands/tui/permission_mode_service';
import { SlashCommandHandler, SlashCommandAction } from '../slash_command_handler';

/**
 * Handler for the /auto slash command.
 *
 * Toggles auto mode: while active, tool calls awaiting approval are approved
 * automatically (scope 'once') instead of prompting. `/auto on`, `/auto off`
 * and `/auto status` are supported explicitly; bare `/auto` toggles.
 */
@Injectable(SlashCommandHandler, [Logger, PermissionModeService])
export class DefaultAutoCommandHandler implements SlashCommandHandler {
  #logger: Logger;

  #permissionModeService: PermissionModeService;

  constructor(logger: Logger, permissionModeService: PermissionModeService) {
    this.#logger = withPrefix(logger, '[AutoCommandHandler]');
    this.#permissionModeService = permissionModeService;
  }

  command = {
    name: '/auto',
    description: 'Toggle auto mode (approve tool calls automatically for this session)',
    action: SlashCommandAction.Auto,
    aliases: ['/yolo'],
  } as const;

  async execute(api: ControllerApi, args?: string[]): Promise<void> {
    const arg = args?.[0]?.toLowerCase();

    if (arg === 'status') {
      api.showInfo(`Auto mode is ${this.#permissionModeService.isAuto() ? 'on' : 'off'}`);
      return;
    }

    let mode: PermissionMode;
    if (arg === 'on') {
      mode = 'auto';
    } else if (arg === 'off') {
      mode = 'default';
    } else if (arg === undefined) {
      mode = this.#permissionModeService.isAuto() ? 'default' : 'auto';
    } else {
      api.showError(`Unknown argument "${arg}". Usage: /auto [on|off|status]`);
      return;
    }

    this.#permissionModeService.setMode(mode);
    api.mutateState((state) => ({ ...state, permissionMode: mode }));

    this.#logger.info(`Auto mode set to '${mode}' via /auto`);
    api.showInfo(
      mode === 'auto'
        ? '⏵⏵ Auto mode on — tool calls will be approved automatically. Use /auto off to disable.'
        : 'Auto mode off — tool calls will require approval.',
    );
  }
}
