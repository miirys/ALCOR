# Persistent Storage

A file-based storage system for persisting global and user settings across GitLab LSP clients (VSCode, JetBrains, CLI).

## Architecture

The storage system consists of two main components:

### `PersistentStorage` (Generic Storage)

A simple, generic key/value storage that handles:

- File operations and initialization
- File locking for concurrent access
- Basic CRUD operations (get/set/delete)
- Error handling and recovery

### `UserPersistentStorage` (User/Client Scoped storage)

A user-aware layer that provides:

- Client-specific settings (VSCode, JetBrains, CLI)
- Global settings (shared across all clients)
- Multi-user support with data isolation
- Schema validation using Zod
- Type-safe storage operations

## Storage Location

By default, settings are stored in `~/.gitlab/storage.json` in the [user home directory](https://nodejs.org/api/os.html#oshomedir). This can be overridden with the `GITLAB_LSP_STORAGE_DIR` environment variable:

```bash
export GITLAB_LSP_STORAGE_DIR=/custom/path
```

## Usage

### Generic Storage (PersistentStorage)

For simple key/value storage without user context:

```typescript
import { DefaultPersistentStorage } from '@gitlab-org/persistent-storage';

const storage = new DefaultPersistentStorage(logger);

// Basic operations
await storage.set('my:key', { data: 'value' });
const value = await storage.get('my:key');
await storage.delete('my:key');

// Lifecycle
storage.isInitialized(); // boolean
storage.close();
```

### User-Aware Storage (UserPersistentStorage)

For user and client-specific settings:

```typescript
import {
  DefaultUserPersistentStorage,
  DefaultPersistentStorage,
} from '@gitlab-org/persistent-storage';

const genericStorage = new DefaultPersistentStorage(logger);
const userStorage = new DefaultUserPersistentStorage(
  genericStorage,
  configService,
  userService,
  logger,
);

// Client-specific settings
await userStorage.set('telemetry', { enabled: true });
const telemetrySettings = await userStorage.get('telemetry');
await userStorage.delete('telemetry');

// Global settings (shared across all clients)
await userStorage.setGlobal('telemetry', { enabled: false });
const globalTelemetry = await userStorage.getGlobal('telemetry');
await userStorage.deleteGlobal('telemetry');
```

## Error Handling

### Generic Storage

- Throws on initialization failures (permission errors, inaccessible directories)
- Throws on file operation errors (read/write failures)
- Automatically recreates corrupted storage files
- Detailed error logging for debugging

### User Storage

- Validates all data against Zod schemas before storage
- Returns `undefined` for missing or invalid data
- Gracefully handles missing user ID or client name
- Logs validation failures and warnings

## Concurrency

Uses `proper-lockfile` to ensure safe concurrent access:

- Automatic retries on lock contention (5 retries, 100-1000ms backoff)
- 5-second stale lock timeout
- Lock is always released, even if operations fail
- Supports multiple processes accessing the same storage file

## Testing

Run tests:

```bash
bun run test:unit -- packages/lib_persistent_storage/src
bun run test:integration:persistent-storage
```
