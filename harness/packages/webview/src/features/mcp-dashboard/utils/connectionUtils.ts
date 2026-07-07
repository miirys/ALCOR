import { Wifi, WifiOff, Loader2, ShieldAlert, Clock, XCircle } from 'lucide-vue-next';
import type { Component } from 'vue';
import { ConnectionState } from '../types/mcp';

/**
 * Get the appropriate icon component based on the connection state.
 *
 * @param connectionState - The current connection state of the MCP server
 * @returns The icon component to display
 */
export function getConnectionIcon(connectionState?: ConnectionState): Component {
  if (!connectionState) return WifiOff;

  switch (connectionState) {
    case ConnectionState.Connected:
      return Wifi;
    case ConnectionState.Connecting:
      return Loader2;
    case ConnectionState.Authenticating:
      return ShieldAlert;
    case ConnectionState.Failed:
      return WifiOff;
    case ConnectionState.Disconnected:
      return WifiOff;
    case ConnectionState.PendingApproval:
      return Clock;
    case ConnectionState.Rejected:
      return XCircle;
    default:
      return WifiOff;
  }
}

/**
 * Get the appropriate CSS classes for the connection icon based on the connection state.
 *
 * @param connectionState - The current connection state of the MCP server
 * @returns CSS class string for styling the icon
 */
export function getConnectionIconClass(connectionState?: ConnectionState): string {
  if (!connectionState) return 'text-muted-foreground';

  switch (connectionState) {
    case ConnectionState.Connected:
      return 'text-green-600';
    case ConnectionState.Connecting:
      return 'text-blue-600 animate-spin';
    case ConnectionState.Authenticating:
      return 'text-orange-600';
    case ConnectionState.Failed:
      return 'text-destructive';
    case ConnectionState.Disconnected:
      return 'text-amber-600';
    case ConnectionState.PendingApproval:
      return 'text-yellow-600';
    case ConnectionState.Rejected:
      return 'text-destructive';
    default:
      return 'text-muted-foreground';
  }
}

/**
 * Get the human-readable label for the connection state.
 *
 * @param connectionState - The current connection state of the MCP server
 * @returns A human-readable label for the connection state
 */
export function getConnectionLabel(connectionState?: ConnectionState): string {
  if (!connectionState) return 'Idle';

  switch (connectionState) {
    case ConnectionState.Connected:
      return 'Connected';
    case ConnectionState.Connecting:
      return 'Connecting...';
    case ConnectionState.Authenticating:
      return 'Auth Required';
    case ConnectionState.Failed:
      return 'Failed';
    case ConnectionState.Disconnected:
      return 'Disconnected';
    case ConnectionState.PendingApproval:
      return 'Pending Approval';
    case ConnectionState.Rejected:
      return 'Rejected';
    default:
      return 'Idle';
  }
}
