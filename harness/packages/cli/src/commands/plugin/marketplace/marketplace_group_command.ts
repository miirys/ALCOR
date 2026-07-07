import type { DuoCommand } from '../../duo_command';
import type { PluginContainerProvider } from '../plugin_services';
import { MarketplaceAddCommand } from './marketplace_add_command';
import { MarketplaceListCommand } from './marketplace_list_command';

export class MarketplaceGroupCommand implements DuoCommand {
  readonly name = 'marketplace';

  readonly description = 'Manage plugin marketplaces.';

  readonly children: DuoCommand[];

  constructor(containerProvider: PluginContainerProvider) {
    this.children = [
      new MarketplaceAddCommand(containerProvider),
      new MarketplaceListCommand(containerProvider),
    ];
  }

  register(): void {}
}
