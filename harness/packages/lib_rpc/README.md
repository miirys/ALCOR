# `@gitlab-org/rpc`

## Overview

The `@gitlab-org/rpc` package provides the foundational types and utilities for implementing type-safe RPC (Remote Procedure Call) communication in the language server. At its core, this package enables you to define, validate, and manage the structure of messages that flow between different parts of your application.

## Installation

Add the package to your project:

```json
{
  "dependencies": {
    "@gitlab-org/rpc": "0.0.0" // local workspace version
  }
}
```

NOTE: The package requires `zod` as a dependency for runtime type validation.

## Core Concepts

### Message Definitions

Message definitions serve as contracts between message senders and receivers. Every message in the system is defined using two primary types:

1. Notifications: One-way messages that don't expect responses
1. Requests: Two-way messages that expect responses

Each message definition includes:

- A method name for identification
- An optional friendly name for documentation
- An optional description
- Schema definitions for parameters and responses

### Type Safety

The package uses TypeScript and Zod to provide two layers of type safety:

1. Compile-time type checking through TypeScript interfaces
1. Runtime validation through Zod schemas

This dual approach ensures that messages are correctly structured both during development and at runtime.

## API Reference

### Message Definition Types

#### RpcMessageDefinitionBase

The base interface for all message definitions:

```typescript
interface RpcMessageDefinitionBase {
  /**
   * Unique identifier used for routing messages
   */
  methodName: string;

  /**
   * Human-readable name for documentation
   */
  name?: string;

  /**
   * Detailed description of the message's purpose
   */
  description?: string;
}
```

#### RpcNotificationDefinition

Definition for one-way messages:

```typescript
interface RpcNotificationDefinition<TParams = unknown> extends RpcMessageDefinitionBase {
  type: 'notification';
  paramsSchema: z.ZodType<TParams>;
}
```

Example usage:

```typescript
const userLoggedInNotification: RpcNotificationDefinition<{ userId: string }> = {
  type: 'notification',
  methodName: 'user/loggedIn',
  name: 'User Logged In',
  description: 'Sent when a user successfully authenticates',
  paramsSchema: z.object({
    userId: z.string(),
  }),
};
```

#### RpcRequestDefinition

Definition for request-response messages:

```typescript
interface RpcRequestDefinition<TParams = unknown, TResponse = void>
  extends RpcMessageDefinitionBase {
  type: 'request';
  paramsSchema: z.ZodType<TParams>;
  responseSchema: z.ZodType<TResponse>;
}
```

Example usage:

```typescript
const fetchUserRequest: RpcRequestDefinition<{ userId: string }, { name: string; email: string }> =
  {
    type: 'request',
    methodName: 'user/fetch',
    name: 'Fetch User',
    description: 'Retrieves user details by ID',
    paramsSchema: z.object({
      userId: z.string(),
    }),
    responseSchema: z.object({
      name: z.string(),
      email: z.string(),
    }),
  };
```

### Declaration Builders

The package provides builder patterns for creating message definitions with a fluent API. It is highly recommending that you build message definitions using the fluent builders.

#### declareNotification

Creates a builder for notification definitions:

```typescript
const userUpdatedNotification = declareNotification('user/updated')
  .withName('User Updated')
  .withDescription('Sent when user details are modified')
  .withParams(
    z.object({
      userId: z.string(),
      changes: z.record(z.string(), z.unknown()),
    }),
  )
  .build();
```

#### declareRequest

Creates a builder for request definitions:

```typescript
const searchUsersRequest = declareRequest('users/search')
  .withName('Search Users')
  .withDescription('Searches for users based on criteria')
  .withParams(
    z.object({
      query: z.string(),
      limit: z.number().optional(),
    }),
  )
  .withResponse(
    z.array(
      z.object({
        id: z.string(),
        name: z.string(),
      }),
    ),
  )
  .build();
```

### Type Guards

The package includes type guards to safely narrow message types at runtime:

```typescript
function isNotification(message: unknown): message is RpcNotificationDefinition;
function isRequest(message: unknown): message is RpcRequestDefinition;
```

Example usage:

```typescript
if (isRequest(message)) {
  // TypeScript knows this is a request message
  console.log(message.responseSchema);
} else if (isNotification(message)) {
  // TypeScript knows this is a notification message
  console.log(message.paramsSchema);
}
```

### Type Inference Utilities

Helper types for extracting parameter and response types from message definitions:

```typescript
type InferParams<T extends RpcMessageDefinition>;
type InferResponse<T extends RpcMessageDefinition>;
```

Example usage:

```typescript
const searchRequest = declareRequest('users/search')
  .withParams(z.object({ query: z.string() }))
  .withResponse(z.array(z.string()))
  .build();

type SearchParams = InferParams<typeof searchRequest>;
// Inferred as: { query: string }

type SearchResponse = InferResponse<typeof searchRequest>;
// Inferred as: string[]
```

### Constants

The package provides common constants for cases where no parameters or response is needed:

```typescript
export const NO_PARAMS: z.ZodType<undefined>;
export const NO_RESPONSE: z.ZodType<void>;
```

### Message Definition Sources and Providers

The package includes interfaces for organizing message definitions:

#### RpcMessageDefinitionSource

Represents a modular source of message definitions:

```typescript
interface RpcMessageDefinitionSource<T extends RpcMessageDefinition = RpcMessageDefinition> {
  getMessageDefinitions(): T[];
}
```

#### RpcMessageDefinitionProvider

Aggregates message definitions from multiple sources:

```typescript
interface RpcMessageDefinitionProvider<T extends RpcMessageDefinition = RpcMessageDefinition> {
  getMessageDefinitions(): T[];
}
```

## Best Practices

### Message Definition Organization

Group related messages into dedicated source files:

```typescript
// user-messages.ts
export const UserMessages = {
  userCreated: declareNotification('user/created').withParams(userCreatedSchema).build(),

  userUpdated: declareNotification('user/updated').withParams(userUpdatedSchema).build(),

  fetchUser: declareRequest('user/fetch')
    .withParams(userFetchParamsSchema)
    .withResponse(userResponseSchema)
    .build(),
};
```

### Schema Validation

Define comprehensive schemas for proper runtime validation:

```typescript
const userSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().min(1),
    age: z.number().min(0).max(120).optional(),
  })
  .strict(); // Ensures no extra properties
```

### Method Naming

Follow a consistent pattern for method names:

```typescript
// Good
'user/create';
'user/profile/update';
'documents/share';

// Avoid
'createUser';
'update-profile';
'ShareDocument';
```

### Type Safety

Leverage TypeScript's type system with message definitions:

```typescript
function handleUserUpdate(message: InferParams<typeof UserMessages.userUpdated>) {
  // TypeScript provides full type information
  const { userId, changes } = message;
}
```

## Integration with VS Code

The package provides utilities for integrating with VS Code's JSON-RPC protocol:

```typescript
import { toVSCodeNotificationType, toVSCodeRequestType } from '@gitlab-org/rpc';

// Convert to VS Code notification type
const vscodeNotification = toVSCodeNotificationType(userUpdatedNotification);

// Convert to VS Code request type
const vscodeRequest = toVSCodeRequestType(fetchUserRequest);
```
