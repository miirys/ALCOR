# Language Server Webview Developer Guide

## Table of Contents

1. [Introduction](#introduction)
1. [Core Concepts](#core-concepts)
   - [Webview Communication Model](#webview-communication-model)
   - [Message Types](#message-types)
1. [Implementation Guide](#implementation-guide)
   - [Defining the Message Interface](#1-defining-the-message-interface)
   - [Creating a Connection Identifier](#2-create-a-webiewconnection-identifier)
   - [Implementing the Connection Provider](#3-implementing-the-connection-provider)
1. [Common Implementation Patterns](#common-implementation-patterns)
   - [Handling Inbound Notifications](#handling-inbound-notifications)
   - [Request Handling and Forwarding](#request-handling-and-forwarding)
   - [Broadcasting to Multiple Webviews](#broadcasting-to-multiple-webviews)
   - [Forward a Request From the Extension to a Webview](#forward-a-request-from-the-extension-to-a-webview)

## Introduction

This guide exaplains how to implement webview messaging functionality within the GitLab Language Server. The architecture enables bidirectional communication between webviews, the language server, and language server clients (extensions).

## Core Concepts

### Webview Communication Model

The system implements a message bus architecture that supports two primary communication patterns:

- **Notifications**: One-way messages that don't require a response. These are useful for broadcasting state changes or triggering side effects.

- **Requests**: Two-way messages that expect a response. These are used when the sender needs confirmation or data back from the receiver.

The communication model ensures messages are properly routed between components while maintaining type safety throughout the system.

### Message Types

Messages are strictly typed using TypeScript, in order to guarantee compile-time message safety. The system defines two main categories of messages:

1. **fromWebview**: Messages originated from webview instances
1. **toWebview**: Messages send to webview instances

## Implementation Guide

### 1. Defining the Message Interface

The message interface serves as a contract between all communicating components. It defines the structure and types of all possible messages in the system.

```typescript
export type ExampleWebviewMessages = CreateWebviewMessages<{
  fromWebview: {
    notifications: {
      exampleInboundNotification: { prop: string };
    };
    requests: {
      exampleInboundRequest: {
        params: { prop: string };
        result: { prop: string };
      };
    };
  };
  toWebview: {
    notifications: {
      exampleOutboundNotification: { prop: string };
    };
    requests: {
      exampleOutboundRequest: {
        params: { prop: string };
        result: { prop: string };
      };
    };
  };
}>;
```

Key aspects of the message interface:

- Messages are organized by direction (fromWebview/toWebview)
- Each direction supports both notifications and requests
- Each message type has defined parameter and result types
- TypeScript ensures type safety throughout the system

### 2. Create a Webiew/Connection Identifier

Each Webview needs a unique identifier to prevent message crossing and enable proper routing:

```typescript
export const EXAMPLE_WEBVIEW_CONNECTION_ID = 'my_webview' as WebviewId<ExampleWebviewMessages>;
```

### 3. Implementing the Connection Provider

The connection provider serves as a factory for webview connections. It encapsulates the complexity of connection management and provices a clean interface for obtaning connections. We can simplify this even further and provide a connection provider specific to our webview.

```typescript
@Injectable(ExampleWebviewConnectionProvider, [WebviewConnectionProvider])
export class DefaultExampleWebviewConnectionProvider implements ExampleWebviewConnectionProvider {
  #connectionProvider: WebviewConnectionProvider;

  constructor(connectionProvider: WebviewConnectionProvider) {
    this.#connectionProvider = connectionProvider;
  }

  getConnection(): WebviewConnection<ExampleWebviewMessages> {
    return this.#connectionProvider.getConnection<ExampleWebviewMessages>(
      EXAMPLE_WEBVIEW_CONNECTION_ID,
    );
  }
}
```

## Common Implementation Patterns

### Handling Inbound Notifications

```typescript
export class NotificationHandlerService extends Disposable {
  #connection: WebviewConnection<ExampleWebviewMessages>;

  constructor(connectionProvider: ExampleWebviewConnectionProvider) {
    this.#connection = connectionProvider.getConnection();

    // Set up handlers when webview instances connect
    this.#connection.onInstanceConnected((webviewInstanceId, webviewMessageBus) => {
      // Register notification handler
      webviewMessageBus.onNotification('exampleInboundNotification', (props) => {
        // Handle the notification
        this.processNotification(props);
      });
    });
  }

  private processNotification(props: { prop: string }) {
    // Implement notification processing logic
    console.log(`Processing notification: ${props.prop}`);
  }

  dispose() {
    // Clean up resources
    this.#connection.dispose();
  }
}
```

### Request Handling and Forwarding

Requests can be handled locally or forwarded to the extension for processing:

```typescript
export class RequestHandlerService extends Disposable {
  #connection: WebviewConnection<ExampleWebviewMessages>;

  constructor(
    private connectionProvider: ExampleWebviewConnectionProvider,
    private rpcMessageSender: RpcMessageSender,
  ) {
    this.#connection = connectionProvider.getConnection();

    this.#connection.onInstanceConnected((webviewInstanceId, webviewMessageBus) => {
      webviewMessageBus.onRequest('exampleInboundRequest', async (props) => {
        // Forward to extension
        const response = await this.forwardToExtension(props);
        return response;
      });
    });
  }

  private async forwardToExtension(props: { prop: string }) {
    // Forward request to extension and await response
    const response = await this.rpcMessageSender.send(RpcMessages.ExampleRequest, {
      exampleParam: props.prop,
    });

    return { prop: response.exampleParam };
  }

  dispose() {
    this.#connection.dispose();
  }
}
```

### Broadcasting to Multiple Webviews

When you need to send the same message to all connected webviews (scoped by the connection):

```typescript
export class BroadcastService extends Controller {
  #connection: WebviewConnection<ExampleWebviewMessages>;

  constructor(connectionProvider: ExampleWebviewConnectionProvider) {
    super();
    this.#connection = connectionProvider.getConnection();
  }

  broadcastUpdate(message: string) {
    // Send to all connected webviews
    this.#connection.broadcast('exampleOutboundNotification', {
      prop: message,
    });
  }
}
```

### Forward a Request From the Extension to a Webview

If you want the language server to forward a request to all connected webviews and return the first response, so that I get a timely reply from the most responsive client.

```typescript
import { Controller, endpoint } from '@gitlab-org/rpc-endpoint';
import { RpcMessageSender } from '@gitlab-org/rpc-client';
import { RpcMessages } from './rpc-messages';
import {
  ExampleWebviewConnectionProvider,
  ExampleWebviewMessages,
} from './webview-messages-and-connection';
import { InferParams, InferResponse } from '@gitlab-org/rpc';
import { WebviewInstanceId } from '@gitlab-org/webview-plugin';

/**
 * This service forwards an RPC request from the extension to all connected webviews
 * and returns the first received response.
 */
export class ForwardRequestService extends Controller {
  private connection = this.connectionProvider.getConnection();

  // Map tracking connected webview instances.
  // In a complete implementation, this would be managed via onInstanceConnected.
  private connectedWebviews = new Map<WebviewInstanceId, MessageBus>();

  constructor(
    private connectionProvider: ExampleWebviewConnectionProvider,
    private rpcMessageSender: RpcMessageSender,
  ) {
    super();
  }

  @endpoint(RpcMessages.ExampleRequest)
  async handleExampleRequest(
    params: InferParams<typeof RpcMessages.ExampleRequest>,
  ): Promise<InferResponse<typeof RpcMessages.ExampleRequest>> {
    // Forward the request to all webview instances and wait for the first response.
    const firstResponse = await Promise.race(
      [...this.connectedWebviews.values()].map((bus) =>
        bus.sendRequest('exampleOutboundRequest', {
          prop: params.exampleParam,
        }),
      ),
    );
    return { exampleParam: firstResponse.prop };
  }
}
```
