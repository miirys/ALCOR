# Language Server RPC Messaging Developer Guide

## Table of Contents

1. [Introduction](#introduction)
1. [System Architecture](#system-architecture)
1. [Core Packages](#core-packages)
1. [Message Types and Definitions](#message-types-and-definitions)
1. [Implementation Guide](#implementation-guide)
1. [Best Practices](#best-practices)

## Introduction

The GitLab RPC Messaging System is a type-safe, extensible framework for handling remote procedure calls between the language server and a connected client (extensions). It provides a robust foundation for defining and implementing client-server communication with strong typing support and runtime validation.

### Key Features

- Type-safe message definitions using TypeScript and Zod
- Support for both request-response and notification patterns
- Declarative message definition with builder pattern
- Runtime validation of message parameters and responses
- Integration with VS Code's JSON-RPC protocol
- Dependency injection support for better modularity

## System Architecture

The RPC system is built around three main concepts:

1. **Message Definitions**: Strongly-typed declarations of available messages, including their parameters and expected responses
1. **Message Senders**: Components responsible for sending messages across the wire
1. **Endpoints**: Handler implementations that process incoming messages

## Core Packages

### `@gitlab-org/rpc`

The foundation package that defines the core types and utilities for RPC messaging.

### `@gitlab-org/rpc-client`

Provides client-side functionality for sending RPC messages:

```typescript
interface RpcMessageSender {
  send<TResponse>(
    messageDefinition: RpcMessageDefinition<NO_PARAMS, TResponse>,
  ): Promise<TResponse>;
  send<TParams, TResponse>(
    messageDefinition: RpcMessageDefinition<TParams, TResponse>,
    params: TParams,
  ): Promise<TResponse>;
}
```

### `@gitlab-org/rpc-endpoint`

Handles server-side message processing and routing:

```typescript
interface EndpointProvider {
  getEndpoints(): Endpoint[];
}
```

## Message Types and Definitions

The system supports two primary types of messages:

### 1. Notifications (One-way Messages)

Notifications are fire-and-forget messages that don't expect a response:

```typescript
const exampleNotification = declareNotification('myapp/userLoggedIn')
  .withName('User Logged In')
  .withDescription('Triggered when a user successfully logs in')
  .withParams(
    z.object({
      userId: z.string(),
      timestamp: z.number(),
    }),
  )
  .build();
```

### 2. Requests (Two-way Messages)

Requests expect a response from the receiver:

```typescript
const exampleRequest = declareRequest('myapp/fetchUserProfile')
  .withName('Fetch User Profile')
  .withDescription('Retrieves detailed user profile information')
  .withParams(
    z.object({
      userId: z.string(),
    }),
  )
  .withResponse(
    z.object({
      name: z.string(),
      email: z.string(),
      preferences: z.record(z.string(), z.string()),
    }),
  )
  .build();
```

## Implementation Guide

### Creating Message Definitions

1. First, define your message using the declaration builders:

```typescript
export const UserMessages = {
  userUpdated: declareNotification('user/updated')
    .withParams(
      z.object({
        id: z.string(),
        changes: z.record(z.string(), z.unknown()),
      }),
    )
    .build(),

  fetchUserDetails: declareRequest('user/fetchDetails')
    .withParams(z.object({ id: z.string() }))
    .withResponse(
      z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
      }),
    )
    .build(),
};
```

### Implementing an Endpoint Handler

Create a controller class to handle incoming messages:

```typescript
@Injectable()
export class UserController extends Controller {
  #userService: UserService;

  constructor(userService: UserService) {
    super();
    this.#userService = userService;
  }

  @endpoint(UserMessages.fetchUserDetails)
  async handleFetchUserDetails(params: { id: string }) {
    return this.#userService.getUserDetails(params.id);
  }
}
```

### Sending Messages from the RpcMessageSender

Use the RpcMessageSender to communicate with the server:

```typescript
export class UserClient {
  #messageSender: RpcMessageSender;

  constructor(messageSender: RpcMessageSender) {
    this.#messageSender = messageSender;
  }

  async fetchUserDetails(userId: string) {
    return this.#messageSender.send(UserMessages.fetchUserDetails, {
      id: userId,
    });
  }
}
```

## Best Practices

### Message Definition

1. **Consistent Naming**: Use a consistent pattern for method names, such as `{domain}/{action}`. For more information,
   see [supported messages](../supported_messages.md).
1. **Clear Documentation**: Always include meaningful names and descriptions in message definitions
1. **Type Safety**: Leverage Zod schemas to ensure runtime type safety

### Custom Validation

Extend the base validation with custom rules:

```typescript
const customValidation = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().min(0).max(120),
});
```
