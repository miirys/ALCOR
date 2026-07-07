import type { DuoCommand } from '../duo_command';
import type { ExitHandler } from '../../utils/exit';
import { ConfigEditCommand } from './config_edit_command';

export class ConfigGroupCommand implements DuoCommand {
  readonly name = 'config';

  readonly description =
    'Configuration management commands. Settings configured here do not apply when using the ALCOR through `glab`.';

  readonly children: DuoCommand[];

  constructor(exitHandler: ExitHandler) {
    this.children = [new ConfigEditCommand(exitHandler)];
  }

  register(): void {}
}
