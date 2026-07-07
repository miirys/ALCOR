import type { Command } from 'commander';
import { Logger } from '@gitlab-org/logging';
import { MarketplaceRegistry } from '@gitlab-org/duo-plugin-marketplace/node';
import type { DuoCommand } from '../../duo_command';
import { ExitHandler } from '../../../utils/exit';
import type { PluginContainerProvider } from '../plugin_services';

export class MarketplaceAddCommand implements DuoCommand {
  readonly name = 'add <source>';

  readonly description = 'Register a plugin marketplace from a git repository or local directory.';

  readonly #containerProvider: PluginContainerProvider;

  constructor(containerProvider: PluginContainerProvider) {
    this.#containerProvider = containerProvider;
  }

  register(node: Command): void {
    node.action(async (source: string) => {
      const registry = this.#containerProvider.getRequiredService(MarketplaceRegistry, node);

      try {
        const entry = await registry.add(source);
        // eslint-disable-next-line no-console
        console.log(`Added marketplace "${entry.name}" (${entry.marketplace.installLocation})`);
      } catch (e) {
        const logger = this.#containerProvider.getRequiredService(Logger, node);
        logger.error('Failed to add marketplace', e instanceof Error ? e : new Error(String(e)));
        const message = e instanceof Error ? e.message : String(e);
        // eslint-disable-next-line no-console
        console.error(`Failed to add marketplace: ${message}`);
        await this.#containerProvider.getRequiredService(ExitHandler, node).exit(1);
      }
    });
  }
}
