# `@gitlab-org/rpc-client`

A type-safe RPC (Remote Procedure Call) client library for GitLab applications. This package provides a consistent way to send messages to language server connected clients while ensuring type safety and runtime validation.

## Core Interface

The package centers around the `RpcMessageSender` interface, which provides a type-safe way to send messages:

```typescript
interface RpcMessageSender {
  // For messages that don't require parameters
  send<TResponse>(
    messageDefinition: RpcMessageDefinition<NO_PARAMS, TResponse>,
  ): Promise<TResponse>;

  // For messages that require parameters
  send<TParams, TResponse>(
    messageDefinition: RpcMessageDefinition<TParams, TResponse>,
    params: TParams,
  ): Promise<TResponse>;
}
```

The main implementation, `LsConnectionRpcMessageSender`, works with the `vscode-languageserver` library and handles both request-response and notification patterns.

## Typical Usage

Here's how you might use the package in a typical application:

```typescript
import { MessageConnection } from 'vscode-jsonrpc';
import { LsConnectionRpcMessageSender } from '@gitlab-org/rpc-client';
import { declareRequest } from '@gitlab-org/rpc';
import { z } from 'zod';

// Define your messages
const userMessages = {
  fetchUser: declareRequest('user/fetch')
    .withParams(z.object({
      userId: z.string()
    }))
    .withResponse(z.object({
      name: z.string(),
      email: z.string()
    }))
    .build()
};

// Create a client class
class UserClient {
  #sender: RpcMessageSender;

  constructor(sender: RpcMessageSender) {
    this.#sender = sender;
  }

  async fetchUser(userId: string) {
    try {
      return await this.#sender.send(userMessages.fetchUser, { userId });
    } catch (error) {
      if (error instanceof RpcValidationError) {
        // Handle validation errors (invalid parameters or response)
        console.error('Validation failed:', error.details);
      }
      throw error;
    }
  }
}

// Usage with VS Code's Language Server Protocol
const connection: MessageConnection = /* your connection */;
const messageSender = new LsConnectionRpcMessageSender(
  connection,
  [userMessages.fetchUser]
);
const client = new UserClient(messageSender);

// Make requests
const user = await client.fetchUser('123');
```

## Error Handling

The package uses `RpcValidationError` to provide detailed information about validation failures:

```typescript
import { RpcValidationError } from '@gitlab-org/rpc-client';

try {
  await messageSender.send(userMessages.fetchUser, {
    userId: 123, // Type error: should be string
  });
} catch (error) {
  if (error instanceof RpcValidationError) {
    console.error('Invalid message format:', error.details);
  }
}
```
