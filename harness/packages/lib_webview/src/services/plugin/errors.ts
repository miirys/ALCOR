import { WebviewId } from '@gitlab-org/webview-plugin';

export class PluginRegistrationError extends Error {
  readonly pluginId: WebviewId;

  readonly cause?: Error;

  constructor(pluginId: WebviewId, message: string, cause?: Error) {
    super(`Failed to register plugin ${pluginId}: ${message}`);
    this.name = 'PluginRegistrationError';
    this.pluginId = pluginId;
    this.cause = cause;
  }
}
