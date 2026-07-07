/**
 * Process-wide holder for the pool bridge's live status, mirroring the
 * `workflow_guard` seam. `startPoolBridge` is fire-and-forget and not in the DI
 * graph, so it publishes a status object here that the `/pool` slash command
 * reads. When the bridge isn't running (DUOX_POOL_BRIDGE unset) the holder is
 * empty and `/pool` says so.
 */
export interface PoolGroupStatus {
  id: string;
  active: boolean;
  /** trial active + namespace settled + not exhausted (i.e. switch-ready). */
  ready: boolean;
  exhausted: boolean;
  /** local ledger usage; 0 when the ledger has no snapshot yet (adopted). */
  creditsUsed: number;
  creditsCap: number;
  thresholdCredits: number;
}

export interface PoolBridgeSnapshot {
  logUrl: string | null;
  activeGroupId: string | null;
  groups: PoolGroupStatus[];
  creditsCap: number;
  thresholdCredits: number;
}

export interface PoolBridgeStatus {
  getSnapshot(): PoolBridgeSnapshot;
}

let current: PoolBridgeStatus | undefined;

export function setPoolBridgeStatus(status: PoolBridgeStatus): void {
  current = status;
}

export function clearPoolBridgeStatus(): void {
  current = undefined;
}

export function getPoolBridgeStatus(): PoolBridgeStatus | undefined {
  return current;
}
