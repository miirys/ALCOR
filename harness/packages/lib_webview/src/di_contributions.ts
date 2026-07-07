import {
  DefaultWebviewRuntimeMessageBus,
  DefaultWebviewTransportService,
  DefaultWebviewConnectionProvider,
  DefaultPluginManager,
} from './services';

export const webviewContributions = [
  DefaultWebviewRuntimeMessageBus,
  DefaultWebviewTransportService,
  DefaultWebviewConnectionProvider,
  DefaultPluginManager,
];
