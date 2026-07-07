/**
 * Lockstep test: ensures ConnectionState in mcp_dashboard.ts stays in sync
 * with the canonical definition in @gitlab-org/ai-configuration.
 *
 * Both enums are intentionally duplicated to avoid coupling the webview
 * contract and TUI packages to the backend domain package. This test catches
 * drift at compile time — if a value is added or renamed in either definition
 * the `satisfies` assertions below will produce a type error.
 *
 * If you add a new state to ConnectionState in lib_ai_configuration, you MUST
 * also add it to:
 *   - packages/lib_ai_configuration_webview/src/contract/mcp_dashboard.ts
 *   - packages/tui/src/types.ts
 */

import { ConnectionState as CanonicalConnectionState } from '@gitlab-org/ai-configuration';
import { ConnectionState as WebviewConnectionState } from './mcp_dashboard';

// Each canonical value must be present and identical in the webview copy.
// If a new state is added to CanonicalConnectionState, TypeScript will error here
// until the same key is added to WebviewConnectionState (and vice versa below).
const canonicalToWebview = {
  [CanonicalConnectionState.Connecting]: WebviewConnectionState.Connecting,
  [CanonicalConnectionState.Authenticating]: WebviewConnectionState.Authenticating,
  [CanonicalConnectionState.Connected]: WebviewConnectionState.Connected,
  [CanonicalConnectionState.Disconnected]: WebviewConnectionState.Disconnected,
  [CanonicalConnectionState.Failed]: WebviewConnectionState.Failed,
  [CanonicalConnectionState.PendingApproval]: WebviewConnectionState.PendingApproval,
  [CanonicalConnectionState.Rejected]: WebviewConnectionState.Rejected,
} satisfies Record<CanonicalConnectionState, WebviewConnectionState>;

// Each webview value must be present and identical in the canonical copy.
const webviewToCanonical = {
  [WebviewConnectionState.Connecting]: CanonicalConnectionState.Connecting,
  [WebviewConnectionState.Authenticating]: CanonicalConnectionState.Authenticating,
  [WebviewConnectionState.Connected]: CanonicalConnectionState.Connected,
  [WebviewConnectionState.Disconnected]: CanonicalConnectionState.Disconnected,
  [WebviewConnectionState.Failed]: CanonicalConnectionState.Failed,
  [WebviewConnectionState.PendingApproval]: CanonicalConnectionState.PendingApproval,
  [WebviewConnectionState.Rejected]: CanonicalConnectionState.Rejected,
} satisfies Record<WebviewConnectionState, CanonicalConnectionState>;

// Runtime sanity check: values must be identical strings (not just structurally compatible).
describe('ConnectionState lockstep', () => {
  it('webview ConnectionState values match the canonical definition', () => {
    for (const [key, value] of Object.entries(canonicalToWebview)) {
      expect(value).toBe(key);
    }
  });

  it('canonical ConnectionState values match the webview definition', () => {
    for (const [key, value] of Object.entries(webviewToCanonical)) {
      expect(value).toBe(key);
    }
  });
});
