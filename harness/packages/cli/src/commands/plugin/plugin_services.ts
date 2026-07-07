import type { Command } from 'commander';
import {
  createInstanceDescriptor,
  ServiceCollection,
  type ServiceIdentifier,
  type ServiceProvider,
} from '@gitlab/needle';
import { DefaultLogger, LOG_LEVEL, type LogLevel, LogLevelProvider } from '@gitlab-org/logging';
import { FsFileAccessService } from '@gitlab-org/fs/node';
import { duoPluginMarketplaceContributions } from '@gitlab-org/duo-plugin-marketplace/node';
import { ExitHandler } from '../../utils/exit';
import { CliFileLogWriter } from '../log/cli_file_log_writer';
import { DefaultLogLevelProvider } from '../log/cli_log_level_provider';

function buildPluginContainer(exitHandler: ExitHandler, logLevel: LogLevel): ServiceProvider {
  const serviceCollection = new ServiceCollection();
  serviceCollection.add(
    createInstanceDescriptor({ instance: exitHandler, aliases: [ExitHandler] }),
  );
  serviceCollection.add(
    createInstanceDescriptor({
      instance: new DefaultLogLevelProvider(logLevel),
      aliases: [LogLevelProvider],
    }),
  );
  serviceCollection.addClass(CliFileLogWriter, DefaultLogger, FsFileAccessService);
  serviceCollection.addClass(...duoPluginMarketplaceContributions);

  return serviceCollection.build();
}

/**
 * Lazily builds (once) the DI container shared by all `duo plugin` commands and
 * resolves services from it. The marketplace package is DI-native, so the CLI
 * owns resolution here (commander actions run outside the main container). The
 * container uses the standard file-based logger (so command activity lands in
 * the CLI log file) and is handed to `ExitHandler.setDiContainer` on first
 * build so pending log writes are flushed on exit.
 */
export class PluginContainerProvider {
  readonly #exitHandler: ExitHandler;

  #container: ServiceProvider | undefined;

  constructor(exitHandler: ExitHandler) {
    this.#exitHandler = exitHandler;
  }

  /**
   * Resolve a service from the shared container, building it on first use.
   */
  getRequiredService<T>(identifier: ServiceIdentifier<T>, node: Command): T {
    return this.#getContainer(node).getRequiredService(identifier);
  }

  #getContainer(node: Command): ServiceProvider {
    if (!this.#container) {
      const logLevel = (node.optsWithGlobals().logLevel as LogLevel) ?? LOG_LEVEL.INFO;
      this.#container = buildPluginContainer(this.#exitHandler, logLevel);
      // Hand the container to the exit handler so the file logger's pending
      // writes are flushed before the process exits.
      this.#exitHandler.setDiContainer(this.#container);
    }
    return this.#container;
  }
}
