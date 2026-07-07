# @GitLab-org/webview-plugin

The `@gitlab-org/webview-plugin` package enables the creation of plugins that extend the capabilities of webview instances within an IDE environment. These plugins facilitate structured communication between the webview instances and the host extension, allowing for the development of modular and extensible features.

## Use of Webview Plugins

Webview plugins are designed to integrate with the webview runtime environment, allowing for the setup of complex logic and handling of various message types. They provide structured communication channels for notifications and requests between the plugin, webview instances, and the extension host.

## Setting Up a Webview Plugin

To set up a webview plugin, you need to define the plugin's message map, implement the setup function, and register the plugin with the webview runtime.

### Key Components

- **Plugin Message Map**: Defines the structure of messages that the plugin can handle.
- **Setup Function**: Configures the communication between the webview plugin and the extension, as well as between the webview plugin and individual webview instances.
- **WebviewPlugin Definition**: Represents the plugin, including its ID, title, and setup function.

### Example Setup

Here's an example of setting up a webview plugin:

#### Define the Plugin Message Map

```typescript
import { CreatePluginMessageMap } from '@gitlab-org/webview-plugin';
import { Notification, Request } from '@gitlab-org/message-bus';

type MyPluginMessages = CreatePluginMessageMap<{
  extensionToPlugin: {
    notifications: {
      'custom/extension/notification': string;
    };
    requests: {
      'custom/extension/request': {
        params: number;
        result: boolean;
      };
    };
  };
  pluginToExtension: {
    notifications: {
      'custom/plugin/notification': number;
    };
    requests: {
      'custom/plugin/request': {
        params: undefined;
        result: boolean;
      };
    };
  };
  webviewToPlugin: {
    notifications: {
      'custom/webview/notification': boolean;
    };
    requests: {
      'custom/webview/request': {
        params: string;
        result: boolean;
      };
    };
  };
  pluginToWebview: {
    notifications: {
      'custom/plugin/notification': string;
    };
    requests: {
      'custom/plugin/request': {
        params: number;
        result: boolean;
      };
    };
  };
}>;
```

#### Implement the Setup Function

```typescript
import {
  WebviewPlugin,
  WebviewPluginSetupFunc,
  WebviewMessageBus,
  ExtensionMessageBus,
} from '@gitlab-org/webview-plugin';

const setupMyPlugin: WebviewPluginSetupFunc<MyPluginMessages> = ({ webview, extension }) => {
  webview.onInstanceConnected((webviewInstanceId, webviewMessageBus) => {
    // Handle notifications from webview instances
    webviewMessageBus.onNotification('custom/webview/notification', (flag) => {
      console.log(`Received notification from webview instance ${webviewInstanceId}: ${flag}`);
    });

    // Handle requests from webview instances
    webviewMessageBus.onRequest('custom/webview/request', async (str) => {
      console.log(`Received request from webview instance ${webviewInstanceId}: ${str}`);
      return str.length;
    });

    return {
      dispose: () => {
        // handle any cleanup required when a instance is disconnected
      },
    };
  });

  // Handle notifications from the extension
  extensionMessageBus.onNotification('custom/extension/notification', (message) => {
    console.log(`Received notification from extension: ${message}`);
  });

  // Handle requests from the extension
  extensionMessageBus.onRequest('custom/extension/request', async (num) => {
    console.log(`Received request from extension: ${num}`);
    return num > 0;
  });

  // Return a dispose function to clean up resources
  return () => {
    console.log('Disposing of plugin resources');
  };
};
```

#### Define the Webview Plugin

```typescript
const myPlugin: WebviewPlugin<MyPluginMessages> = {
  id: 'my-plugin-id' as WebviewId,
  title: 'My Custom Plugin',
  setup: setupMyPlugin,
};
```

#### Register the Plugin

```typescript
import { setupWebviewRuntime } from '@gitlab-org/webview';
import { myPlugin } from 'my-plugin';

setupWebviewRuntime({
  connection,
  transports,
  plugins: [myPlugin],
  logger,
});
```
