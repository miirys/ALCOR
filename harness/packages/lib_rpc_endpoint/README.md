# `@gitlab-org/rpc-endpoint`

A TypeScript library for implementing type-safe RPC message handlers using decorators and controllers.

## Core Concepts

The package centers around two main concepts: Controllers and Endpoints. Controllers group related message handlers together, while endpoints handle specific messages.

### Creating a Controller

```typescript
import { Controller, endpoint } from '@gitlab-org/rpc-endpoint';
import { declareRequest } from '@gitlab-org/rpc';
import { z } from 'zod';

// Define your message
const fetchUserRequest = declareRequest('user/fetch')
  .withParams(z.object({
    userId: z.string()
  }))
  .withResponse(z.object({
    name: z.string(),
    email: z.string()
  }))
  .build();

// Implement the handler
@Injectable(...)
export class UserController extends Controller {
  #userService: UserService;

  constructor(userService: UserService) {
    super();
    this.#userService = userService;
  }

  @endpoint(fetchUserRequest)
  async handleFetchUser(params: { userId: string }) {
    return this.#userService.getUser(params.userId);
  }
}
```
