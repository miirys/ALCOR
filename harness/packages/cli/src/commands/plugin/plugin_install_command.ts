import type { Command } from 'commander';
import { Logger } from '@gitlab-org/logging';
import {
  parseSpecifier,
  PluginInstaller,
  type PluginScope,
} from '@gitlab-org/duo-plugin-marketplace/node';
import type { DuoCommand } from '../duo_command';
import { ExitHandler } from '../../utils/exit';
import type { PluginContainerProvider } from './plugin_services';

interface InstallOptions {
  scope: string;
}

function parseScope(value: string): PluginScope {
  if (value === 'user' || value === 'project' || value === 'local') {
    return value;
  }
  throw new Error(`Invalid scope "${value}": expected "user", "project", or "local"`);
}

export class PluginInstallCommand implements DuoCommand {
  readonly name = 'install <plugin@marketplace>';

  readonly description = 'Install a plugin from a registered marketplace.';

  readonly #containerProvider: PluginContainerProvider;

  constructor(containerProvider: PluginContainerProvider) {
    this.#containerProvider = containerProvider;
  }

  register(node: Command): void {
    node.option('--scope <scope>', 'Install scope: user, project, or local.', 'user');
    node.action(async (specifier: string, options: InstallOptions) => {
      try {
        const scope = parseScope(options.scope);
        const spec = parseSpecifier(specifier);
        const workspacePath = (node.optsWithGlobals().cwd as string | undefined) ?? process.cwd();
        const installer = this.#containerProvider.getRequiredService(PluginInstaller, node);
        const result = await installer.install(spec, scope, workspacePath);
        // eslint-disable-next-line no-console
        console.log(`Installed ${result.id} v${result.record.version} (${scope})`);
      } catch (e) {
        const logger = this.#containerProvider.getRequiredService(Logger, node);
        logger.error('Failed to install plugin', e instanceof Error ? e : new Error(String(e)));
        const message = e instanceof Error ? e.message : String(e);
        // eslint-disable-next-line no-console
        console.error(`Failed to install plugin: ${message}`);
        await this.#containerProvider.getRequiredService(ExitHandler, node).exit(1);
      }
    });
  }
}
