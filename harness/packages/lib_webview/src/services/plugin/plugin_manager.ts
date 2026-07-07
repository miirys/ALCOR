import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import { WebviewConnection, WebviewId, WebviewPlugin } from '@gitlab-org/webview-plugin';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { MessageBus } from '@gitlab-org/message-bus';
import { WebviewConnectionProvider } from '../connection/webview_connection_provider';
import { ExtensionMessageBusProvider } from '../../extension_message_bus_provider';
import { PluginRegistrationError } from './errors';

export interface PluginManager {
  registerPlugin(plugin: WebviewPlugin): Disposable;
}

export const PluginManager = createInterfaceId<PluginManager>('PluginManager');

export interface PluginContext {
  webview: WebviewConnection;
  extension: MessageBus;
  logger: Logger;
}

export type RegisteredPlugin = {
  plugin: WebviewPlugin;
  disposable?: Disposable;
};

@Injectable(PluginManager, [WebviewConnectionProvider, ExtensionMessageBusProvider, Logger])
export class DefaultPluginManager implements PluginManager, Disposable {
  readonly #registeredPlugins = new Map<WebviewId, RegisteredPlugin>();

  readonly #connectionProvider: WebviewConnectionProvider;

  readonly #extensionMessageBusProvider: ExtensionMessageBusProvider;

  readonly #logger: Logger;

  readonly #baseLogger: Logger;

  constructor(
    connectionProvider: WebviewConnectionProvider,
    extensionMessageBusProvider: ExtensionMessageBusProvider,
    logger: Logger,
  ) {
    this.#connectionProvider = connectionProvider;
    this.#extensionMessageBusProvider = extensionMessageBusProvider;
    this.#logger = withPrefix(logger, '[PluginManager]');
    this.#baseLogger = logger;
  }

  registerPlugin(plugin: WebviewPlugin): Disposable {
    this.#logger.debug(`Registering plugin: ${plugin.id}`);

    if (this.#registeredPlugins.has(plugin.id)) {
      throw new PluginRegistrationError(plugin.id, 'Plugin with this ID is already registered');
    }

    try {
      const context = this.#createPluginContext(plugin);
      const disposable = this.#setupPlugin(plugin, context);

      this.#registeredPlugins.set(plugin.id, {
        plugin,
        disposable,
      });

      this.#logger.debug(`Successfully registered plugin: ${plugin.id}`);

      return {
        dispose: () => this.#unregisterPlugin(plugin.id),
      };
    } catch (error) {
      throw new PluginRegistrationError(
        plugin.id,
        'Plugin setup failed',
        error instanceof Error ? error : undefined,
      );
    }
  }

  dispose(): void {
    this.#registeredPlugins.forEach((registeredPlugin) => {
      registeredPlugin.disposable?.dispose();
    });
    this.#registeredPlugins.clear();
  }

  #createPluginContext(plugin: WebviewPlugin): PluginContext {
    return {
      webview: this.#connectionProvider.getConnection(plugin.id),
      extension: this.#extensionMessageBusProvider.getMessageBus(plugin.id),
      logger: withPrefix(this.#baseLogger, `[Plugin:${plugin.id}]`),
    };
  }

  #setupPlugin(plugin: WebviewPlugin, context: PluginContext): Disposable {
    this.#logger.debug(`Setting up plugin: ${plugin.id}`);

    const disposable = plugin.setup(context);

    if (!disposable) {
      return { dispose: () => {} };
    }

    return disposable;
  }

  #unregisterPlugin(pluginId: WebviewId): void {
    this.#logger.debug(`Unregistering plugin: ${pluginId}`);

    const pluginRegistration = this.#registeredPlugins.get(pluginId);
    if (!pluginRegistration) {
      return;
    }

    if (pluginRegistration.disposable) {
      pluginRegistration.disposable.dispose();
    }

    this.#registeredPlugins.delete(pluginId);
    this.#logger.debug(`Successfully unregistered plugin: ${pluginId}`);
  }
}
