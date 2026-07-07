---
name: di
description: Using @gitlab/needle dependency injection framework. Covers interface tokens, @Service/@Implements decorators, legacy @Injectable, service registration (addClass, createInstanceDescriptor, createFactoryDescriptor).
---

# Needle Dependency Injection

This project uses `@gitlab/needle` for dependency injection.

## Defining an Interface Token

Use the **value-type merge pattern**: declare an `interface` and a `const` with the same name. The const is a branded token used for DI resolution.

```ts
import { createInterfaceId } from '@gitlab/needle';

export interface SessionManager {
  createSession(): Promise<Session>;
}

// Same name — merges the type and the DI token
export const SessionManager = createInterfaceId<SessionManager>('SessionManager');
```

## Registering a Class — `@Service` + `@Implements` (preferred)

Use `@Service` to declare dependencies and lifetime, and `@Implements` to bind it to an interface token.

**Constructor parameters must match the `dependencies` array in order.**

```ts
import { Implements, Service, ServiceLifetime } from '@gitlab/needle';

@Implements(SessionManager)
@Service({
  dependencies: [Logger, BackendFactory],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultSessionManager implements SessionManager {
  #logger: Logger;
  #backendFactory: BackendFactory;

  constructor(logger: Logger, backendFactory: BackendFactory) {
    this.#logger = withPrefix(logger, '[SessionManager]');
    this.#backendFactory = backendFactory;
  }
}
```

Then register with:

```ts
serviceCollection.addClass(DefaultSessionManager);
```

### Concrete class without an interface

When a class doesn't implement an interface (no `@Implements`), `@Service` alone is enough. The class itself becomes the DI token.

```ts
@Service({
  dependencies: [Logger, ErrorHandler, ParsedCliInput],
  lifetime: ServiceLifetime.Singleton,
})
export class RunController {
  constructor(logger: Logger, errorHandler: ErrorHandler, cliInput: ParsedCliInput) { ... }
}
```

Register and resolve by the class directly:

```ts
serviceCollection.addClass(RunController);
// ...
container.getRequiredService(RunController);
```

## Legacy `@Injectable` decorator

Older code uses `@Injectable` which combines interface binding and dependency declaration in one decorator. **Don't use this for new code** — use `@Service` + `@Implements` instead.

```ts
// Legacy pattern — do not use for new code
@Injectable(FeatureFlagService, [ConfigService, InstanceFeatureFlagsService])
export class DefaultFeatureFlagService { ... }
```

The first argument is the interface token, the second is the dependencies array. Constructor params must match the dependencies array order.

## Three Ways to Add Something to DI

### 1. `addClass` — class with all dependencies already in DI (preferred)


Use this if all dependencies are already in DI.

The class is decorated with `@Service` (and optionally `@Implements`). Needle constructs the instance automatically, injecting dependencies from the container.

```ts
serviceCollection.addClass(DefaultSessionManager);
// Multiple classes at once:
serviceCollection.addClass(DefaultProjectService, DefaultUserService);
```

### 2. `createInstanceDescriptor` — pre-built instance

Use when the instance is created outside DI (e.g., from CLI args, config, or a mock).

```ts
import { createInstanceDescriptor } from '@gitlab/needle';

serviceCollection.add(
  createInstanceDescriptor({
    instance: backendOpts,
    aliases: [GitLabParsedOptions],
  }),
);
```

### 3. `createFactoryDescriptor` — factory function

Use when construction needs runtime logic or manual service resolution.

```ts
import { createFactoryDescriptor, ServiceLifetime } from '@gitlab/needle';

serviceCollection.add(
  createFactoryDescriptor({
    aliases: [WorkflowTokenService],
    factory: (serviceLocator) => {
      const runtimeContext = serviceLocator.getRequiredService(RuntimeContext);
      return new PreConfiguredWorkflowTokenService(
        serviceLocator.getRequiredService(Logger),
        buildToken(backendOpts, runtimeContext),
      );
    },
    lifetime: ServiceLifetime.Singleton,
  }),
);
```

## Injecting a Collection

Use `collection()` when multiple implementations are registered for the same interface token. The constructor receives an array.

```ts
import { collection } from '@gitlab/needle';

@Service({
  dependencies: [Logger, collection(AIContextProvider)],
  lifetime: ServiceLifetime.Singleton,
})
export class ContextManager {
  constructor(logger: Logger, providers: AIContextProvider[]) { ... }
}
```

## Building and Resolving

```ts
const container = serviceCollection.build();
const session = container.getRequiredService(SessionManager);
```

## Key Files

- `packages/cli/src/di.ts` — CLI service registration (all three patterns)
- `packages/cli/src/backend/gitlab/di.ts` — factory and instance descriptor examples
- `packages/cli/src/sessions/session_manager.ts` — `@Service` + `@Implements` example
- `packages/cli/src/commands/run/run_controller.ts` — concrete class with `@Service` only
