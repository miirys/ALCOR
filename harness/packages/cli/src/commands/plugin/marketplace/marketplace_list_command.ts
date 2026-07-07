import type { Command } from 'commander';
import { Logger } from '@gitlab-org/logging';
import type { MarketplaceSource } from '@gitlab-org/duo-plugin-marketplace';
import {
  MarketplaceRegistry,
  type MarketplaceListItem,
} from '@gitlab-org/duo-plugin-marketplace/node';
import type { DuoCommand } from '../../duo_command';
import { ExitHandler } from '../../../utils/exit';
import type { PluginContainerProvider } from '../plugin_services';
import { bold, dim } from '../../../utils/console_style';

function summarizeSource(source: MarketplaceSource): string {
  switch (source.source) {
    case 'url':
      return source.ref ? `${source.url}#${source.ref}` : source.url;
    case 'directory':
      return source.path;
    default:
      return assertNever(source);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected marketplace source: ${JSON.stringify(value)}`);
}

function pluginCountSummary(pluginCount: number | undefined): string {
  if (pluginCount === undefined) {
    return ', catalog unreadable';
  }
  return `, ${pluginCount} ${pluginCount === 1 ? 'plugin' : 'plugins'}`;
}

function formatItem(item: MarketplaceListItem): string {
  const { name, marketplace, pluginCount } = item;
  const updated = new Date(marketplace.lastUpdated).toLocaleString();
  return [
    bold(name),
    summarizeSource(marketplace.source),
    dim(`Updated: ${updated}${pluginCountSummary(pluginCount)}`),
  ].join('\n');
}

export class MarketplaceListCommand implements DuoCommand {
  readonly name = 'list';

  readonly description = 'List registered plugin marketplaces.';

  readonly #containerProvider: PluginContainerProvider;

  constructor(containerProvider: PluginContainerProvider) {
    this.#containerProvider = containerProvider;
  }

  register(node: Command): void {
    node.action(async () => {
      const registry = this.#containerProvider.getRequiredService(MarketplaceRegistry, node);

      try {
        const items = await registry.list();
        if (items.length === 0) {
          // eslint-disable-next-line no-console
          console.log('No marketplaces registered.');
          return;
        }
        // A blank line before each item (so they're separated, with space
        // above the first too); console.log adds the trailing newline.
        // eslint-disable-next-line no-console
        console.log(items.map((item) => `\n${formatItem(item)}`).join('\n'));
      } catch (e) {
        const logger = this.#containerProvider.getRequiredService(Logger, node);
        logger.error('Failed to list marketplaces', e instanceof Error ? e : new Error(String(e)));
        const message = e instanceof Error ? e.message : String(e);
        // eslint-disable-next-line no-console
        console.error(`Failed to list marketplaces: ${message}`);
        await this.#containerProvider.getRequiredService(ExitHandler, node).exit(1);
      }
    });
  }
}
