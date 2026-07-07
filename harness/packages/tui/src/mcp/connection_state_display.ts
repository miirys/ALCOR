import { ConnectionState } from '../types';

export interface StateDisplay {
  icon: string;
  color: string;
}

const STATE_DISPLAY: Record<ConnectionState, StateDisplay> = {
  [ConnectionState.Connected]: { icon: '✓', color: 'green' },
  [ConnectionState.Connecting]: { icon: '↻', color: 'yellow' },
  [ConnectionState.Authenticating]: { icon: '⚷', color: 'yellow' },
  [ConnectionState.Failed]: { icon: '✗', color: 'red' },
  [ConnectionState.Disconnected]: { icon: '○', color: 'gray' },
  [ConnectionState.PendingApproval]: { icon: '⏸', color: 'yellow' },
  [ConnectionState.Rejected]: { icon: '⊘', color: 'red' },
};

export function getConnectionStateDisplay(connectionState: ConnectionState): StateDisplay {
  return STATE_DISPLAY[connectionState] ?? { icon: '?', color: 'gray' };
}
