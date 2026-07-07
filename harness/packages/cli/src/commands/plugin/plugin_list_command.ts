import type { Command } from 'commander';
import { Logger } from '@gitlab-org/logging';
import { PluginRegistry } from '@gitlab-org/duo-plugin-marketplace/node';
import type { DuoCommand } from '../duo_command';
import { ExitHandler } from '../../utils/exit';
import type { PluginContainerProvider } from './plugin_services';
import { formatPluginList } from './format_plugin_list';

export class PluginListCommand implements DuoCommand {
  readonly name = 'list';

  readonly description = 'List installed plugins.';

  readonly #containerProvider: PluginContainerProvider;

  constructor(containerProvider: PluginContainerProvider) {
    this.#containerProvider = containerProvider;
  }

  register(node: Command): void {
    node.action(async () => {
      const registry = this.#containerProvider.getRequiredService(PluginRegistry, node);

      try {
        const workspacePath = (node.optsWithGlobals().cwd as string | undefined) ?? process.cwd();
        const items = await registry.list({ workspacePath });

        const lines = formatPluginList(items);
        // eslint-disable-next-line no-console
        console.log(lines.join('\n'));
      } catch (e) {
        const logger = this.#containerProvider.getRequiredService(Logger, node);
        logger.error('Failed to list plugins', e instanceof Error ? e : new Error(String(e)));
        const message = e instanceof Error ? e.message : String(e);
        // eslint-disable-next-line no-console
        console.error(`Failed to list plugins: ${message}`);
        await this.#containerProvider.getRequiredService(ExitHandler, node).exit(1);
      }
    });
  }
}
