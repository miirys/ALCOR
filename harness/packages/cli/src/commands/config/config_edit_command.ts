import type { Command } from 'commander';
import { NullLogger } from '@gitlab-org/logging';
import { isGlab } from '@gitlab-org/tui';
import type { DuoCommand } from '../duo_command';
import { getInteractiveEnvInfo } from '../../utils/environment';
import type { ExitHandler } from '../../utils/exit';
import { getDefaultConfigurationController } from './configuration_controller';
import { renderConfig } from './configuration';

export class ConfigEditCommand implements DuoCommand {
  readonly name = 'edit';

  readonly description =
    'Edit ALCOR configuration. Not applicable when using the CLI through `glab`.';

  readonly examples = [];

  // Under the glab distribution, `glab` manages credentials so this subcommand
  // is hidden from the help output.
  readonly hidden = isGlab();

  readonly #exitHandler: ExitHandler;

  constructor(exitHandler: ExitHandler) {
    this.#exitHandler = exitHandler;
  }

  register(node: Command): void {
    node.action(async () => {
      const configurationController = await getDefaultConfigurationController();
      const envInfo = await getInteractiveEnvInfo();
      renderConfig(configurationController, envInfo, this.#exitHandler, new NullLogger());
    });
  }
}
