# @GitLab-org/ai-configuration-webview

Shared contract and backend services for MCP Dashboard webview integration.

## Overview

This package provides the contract layer between the MCP Dashboard frontend (webview) and backend (extension/LSP). It uses the `WebviewConnectionProvider` pattern instead of the plugin-based approach.

## Package Structure

```text
lib_ai_configuration_webview/
├── package.json
├── src/
│   ├── index.ts              # Default export (backend services)
│   └── contract/
│       ├── index.ts          # Contract exports
│       └── mcp_dashboard.ts  # MCP Dashboard contract
```

## Exports

### Contract Export (`/contract`)

```typescript
import {
  MCP_DASHBOARD_WEBVIEW_ID,
  McpDashboardMessages,
  ConnectionState,
  type ServerName,
  type McpServerState,
  type McpTool,
  type McpLogEntry,
  // ... more types
} from '@gitlab-org/ai-configuration-webview/contract';
```

**Contents:**

- `MCP_DASHBOARD_WEBVIEW_ID` - Unique webview identifier
- `McpDashboardMessages` - Message contract (requests & notifications)
- Type definitions for servers, tools, logs, etc.
- Enums for ConnectionState, LogLevel

### Default Export (Backend Services - TODO)

```typescript
import { McpDashboardService } from '@gitlab-org/ai-configuration-webview';
```

This will contain the backend implementation that uses `WebviewConnectionProvider`.

## Contract Structure

The contract defines bidirectional communication between frontend and backend:

### Frontend → Backend (`fromWebview`)

**Notifications:**

- `appReady` - Webview initialized
- `reloadServers` - Reload all servers
- `reloadServer` - Reload specific server
- `saveApprovedTools` - Save tool approvals
- `approveTool` - Approve tool for session
- `clearLogsForServer` - Clear logs

**Requests:**

- `getServers` - Get all servers
- `getServer` - Get specific server
- `getTools` - Get all tools
- `getToolsForServer` - Get tools for server
- `executeTool` - Execute a tool
- `getExecutionHistory` - Get execution history
- `getLogs` - Get all logs
- `getLogsForServer` - Get logs for server

### Backend → Frontend (`toWebview`)

**Notifications:**

- `serverStateChanged` - Server state updated
- `serverConnected` - Server connected
- `serverDisconnected` - Server disconnected
- `serverError` - Server error occurred
- `toolsUpdated` - Tools updated for server
- `logAdded` - New log entry
- `initialState` - Initial state on connection

## Type Alignment

The contract types are aligned with `@gitlab-org/ai-configuration` backend types:

- `ServerName` - Branded string type
- `ServerConfig` - Union of stdio/sse/http configs
- `ConnectionState` - Enum matching backend states
- `McpServerInfo` - Server information structure

This ensures type consistency between the backend MCP implementation and the webview contract.

## Usage Example

### Frontend (Webview)

```typescript
import { resolveMessageBus } from '@gitlab-org/webview-client';
import type { McpDashboardMessages } from '@gitlab-org/ai-configuration-webview/contract';

// Get message bus
const messageBus = await resolveMessageBus<McpDashboardMessages>({
  target: 'toWebview',
  source: 'fromWebview',
});

// Send notification
messageBus.sendNotification('reloadServers', { workspacePath: '/path' });

// Listen to notifications
messageBus.onNotification('serverStateChanged', ({ serverName, state }) => {
  console.log(`Server ${serverName} is now ${state.connectionState}`);
});

// Send request
const servers = await messageBus.sendRequest('getServers', undefined);
```

### Backend (Extension/LSP)

```typescript
import { WebviewConnectionProvider } from '@gitlab-org/webview';
import {
  MCP_DASHBOARD_WEBVIEW_ID,
  type McpDashboardMessages
} from '@gitlab-org/ai-configuration-webview/contract';

// Get webview connection
const connection = connectionProvider.getConnection<McpDashboardMessages>(
  MCP_DASHBOARD_WEBVIEW_ID
);

// Listen for webview instances
connection.onInstanceConnected((instanceId, messageBus) => {
  // Handle notifications from webview
  messageBus.onNotification('reloadServers', async ({ workspacePath }) => {
    await mcpManager.reload(workspacePath);
  });

  // Handle requests from webview
  messageBus.onRequest('getServers', async () => {
    return await mcpManager.getServers();
  });

  // Send notifications to webview
  messageBus.sendNotification('serverStateChanged', {
    serverName: 'gitlab',
    state: { /* ... */ }
  });
});
```

## Next Steps

1. ✅ Define contract types in `src/contract/mcp_dashboard.ts`
1. ✅ Export contract from `src/contract/index.ts`
1. ⏳ Implement backend service in `src/index.ts` using `WebviewConnectionProvider`
1. ⏳ Update frontend to use `@gitlab-org/ai-configuration-webview/contract`
1. ⏳ Wire up backend service in extension DI container

## Benefits

- **Type Safety**: End-to-end type safety from contract through to frontend/backend
- **Stable Contract**: Contract changes are explicit and versioned
- **Separation of Concerns**: Frontend doesn't depend on backend implementation details
- **Reusability**: Contract can be used by any webview implementation
- **WebviewConnectionProvider Pattern**: Modern pattern vs legacy plugin approach
