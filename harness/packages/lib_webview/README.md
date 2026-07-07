# @GitLab-org/webview

The `@gitlab-org/webview` package provides a framework for managing communication between webview instances, IDE extensions and a language server in a variety of environments. It supports message handling, request-response workflows, and event-driven interactions using JSON-RPC for extension communication and an abstracted transport layer for webview communication.

## Purpose

This package aims to streamline the development of IDE extensions and webview components by providing a robust communication framework. It handles complex interactions between webview instances and language servers, enabling seamless data exchange and feature integration.

## Features

- **Message Handling**: Supports both notifications and request-response patterns.
- **Event-Driven Architecture**: Allows components to react to lifecycle events.
- **Transport Abstraction**: Facilitates communication across different transport mechanisms.
- **Plugin System**: Extensible via plugins for adding custom webview functionality.

## Installation

This package is a local npm workspace package and should be used within this workspace setup. Simply add this package as a dependency

```json
{
  "name": "my-app",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "@gitlab-org/webview": "0.0.0"
  }
}
```

and run `bun install` at the root of the workspace.

## Usage

### Example Setup

```typescript
// extension message bus provider
```

```typescript
import { setupWebviewRuntime } from '@gitlab-org/webview';
import { Transport } from '@gitlab-org/webview-transport';
import { WebviewPlugin } from '@gitlab-org/webview-plugin';
import { MyExtensionMessageBusProvider } from 'my/extension/bus/provider';

const logger; // logger conforming to @gitlab-org/logging
const transports: Transport[] = []; // Add your custom transports here
const plugins: WebviewPlugin[] = []; // Add your custom webview plugins here

const disposeRuntime = setupWebviewRuntime({
  extensionMessageBusProvider: MyExtensionMessageBusProvider,
  transports,
  plugins,
  logger,
});

// To dispose runtime and clean up resources
disposeRuntime();
```

## Vocabulary

### Transport

Transports define the mechanisms for communication between webview instances and the server. They handle the transmission of messages, requests, and notifications, ensuring data is correctly routed and processed.

Transports expose methods for subscribing to the following events:

- `webview_instance_created`: Triggered when a new webview instance is created.
- `webview_instance_destroyed`: Triggered when a webview instance is destroyed.
- `webview_instance_notification_received`: Triggered when a notification is received from a webview instance.
- `webview_instance_request_received`: Triggered when a request is received from a webview instance.
- `webview_instance_response_received`: Triggered when a response to a request is received from a webview instance.

For more information see the `@gitlab-org/webview-transport` project.

### Webview Plugin

Webview plugins extend the functionality of webview instances by providing additional features and capabilities. They can be configured to handle specific types of messages and requests, enabling modular and extensible development. All "server-side" logic will be expressed from within a plugin. Each plugin provides a `setup` function that is called during the initialization of the webview runtime.

#### Example

```typescript
import { WebviewPlugin } from '@gitlab-org/webview-plugin';

// Example plugin implementation
class MyWebviewPlugin implements WebviewPlugin {
  id = 'my-plugin' as WebviewId;
  title = 'My Plugin';
  setup({ webview, extension }) {
    // Plugin setup logic
  }
}
```

For more information see the `@gitlab-org/webview-plugin` project.

### Message Buses

Message buses facilitate communication between different components in the webview environment. They manage the routing of notifications and requests, ensuring messages are delivered to the correct handlers.

- `ExtensionConnectionMessageBus`: Manages communication between the extension and webview plugin. Handles notifications and requests. Is provided by the consumer of the `@gitlab-org/webview` library.

- `WebviewTransportMessageBus`: Manages communication between webview instances, and the webview plugin, including broadcasting notifications and handling requests and responses.

For additional information see the `@gitlab-org/webview-plugin` project.
