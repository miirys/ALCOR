import type { DuoCommand } from '../duo_command';
import type { ExitHandler } from '../../utils/exit';
import { MarketplaceGroupCommand } from './marketplace/marketplace_group_command';
import { PluginInstallCommand } from './plugin_install_command';
import { PluginListCommand } from './plugin_list_command';
import { PluginContainerProvider } from './plugin_services';

export class PluginGroupCommand implements DuoCommand {
  readonly name = 'plugin';

  readonly description = 'Manage GitLab Duo plugins and marketplaces.';

  // Hidden while the feature is in development — keeps it out of the generated
  // CLI reference (gen_docs skips hidden commands and their children).
  readonly hidden = true;

  readonly children: DuoCommand[];

  constructor(exitHandler: ExitHandler) {
    // One container provider for the whole `plugin` subtree: built lazily on
    // first use and shared by every child command.
    const containerProvider = new PluginContainerProvider(exitHandler);
    this.children = [
      new MarketplaceGroupCommand(containerProvider),
      new PluginInstallCommand(containerProvider),
      new PluginListCommand(containerProvider),
    ];
  }

  register(): void {}
}
