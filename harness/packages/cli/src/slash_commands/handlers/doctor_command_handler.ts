import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  CLI_INPUT_TYPES,
  DiagnosticsDialog,
  diagnosticsFooterHint,
  type DiagnosticsDialogCallbacks,
} from '@gitlab-org/tui';
import type { ControllerApi } from '../../commands/tui/controller_api';
import { DoctorController } from '../../commands/doctor/doctor_controller';
import { type CommandComponentEntry, SlashCommandHandler } from '../slash_command_handler';

@Injectable(SlashCommandHandler, [DoctorController, Logger])
export class DefaultDoctorCommandHandler
  implements SlashCommandHandler<DiagnosticsDialogCallbacks>
{
  #controller: DoctorController;

  #logger: Logger;

  constructor(controller: DoctorController, logger: Logger) {
    this.#controller = controller;
    this.#logger = withPrefix(logger, '[DoctorCommandHandler]');
  }

  command = {
    name: '/doctor',
    description: 'Show diagnostics for the ALCOR environment',
    action: 'doctor',
  } as const;

  async execute(api: ControllerApi): Promise<void> {
    this.#logger.info('Executing /doctor command');
    await api.ensureInitialized();
    await this.#controller.open(api);
  }

  getComponent(api: ControllerApi): CommandComponentEntry<DiagnosticsDialogCallbacks> {
    return {
      inputType: CLI_INPUT_TYPES.DIAGNOSTICS_DIALOG,
      component: DiagnosticsDialog,
      footerHint: diagnosticsFooterHint,
      callbacks: this.#controller.getCallbacks(api),
    };
  }
}
