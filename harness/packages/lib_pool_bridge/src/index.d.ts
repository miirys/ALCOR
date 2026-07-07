// Public type surface for the embedded pool bridge. The implementation stays
// as .js (converting the puppeteer automation to TS is risky and out of scope);
// these declarations cover the pool-state surface the credit-ledger switch path
// and CLI boot actually use.

export interface PoolGroup {
  id: string;
  path: string;
  status: string;
  trialActive?: boolean;
  namespaceSettled?: boolean;
  numericId?: string | number | null;
  createdAt?: string;
}

export interface PoolBridgeCredentialsProvider {
  getCredentials(): Promise<{ token: string; baseUrl: string }>;
}

export interface PoolBridgeLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug?(msg: string): void;
  cat?(name: string): PoolBridgeLogger;
}

/** The subset of the credit ledger the pool reads for fundedness. */
export interface PoolLedger {
  getSnapshot(groupId: string):
    | { exhausted: boolean; creditsUsed: number; thresholdCredits: number; creditsCap: number }
    | undefined;
  forgetGroup?(groupId: string): void;
}

export interface PoolBridgeConfig {
  groupsPoolPath?: string;
  ledger?: PoolLedger;
  [key: string]: unknown;
}

export class GroupPoolManager {
  constructor(config: PoolBridgeConfig, log: PoolBridgeLogger);
  init(credentialsProvider: PoolBridgeCredentialsProvider): Promise<void>;
  getActiveGroup(): PoolGroup | null;
  getPoolState(): PoolState | null;
  ensureDefaultNamespace(credentialsProvider: PoolBridgeCredentialsProvider): Promise<boolean>;
  ensureStandbyGroups(credentialsProvider: PoolBridgeCredentialsProvider): Promise<void>;
  rotateGroup(credentialsProvider: PoolBridgeCredentialsProvider): Promise<void>;
  // credit-aware provisioning (ledger-driven — the ledger is the source of truth):
  setLedger(ledger: PoolLedger): void;
  ensureCreditWorthyActiveGroup(
    credentialsProvider: PoolBridgeCredentialsProvider,
  ): Promise<PoolGroup | null>;
  reconcilePool(credentialsProvider: PoolBridgeCredentialsProvider): Promise<void>;
  // credit-ledger switch contract:
  pickReadyStandby(): Promise<PoolGroup | null>;
  setActiveGroupById(
    id: string,
    credentialsProvider: PoolBridgeCredentialsProvider,
  ): Promise<boolean>;
  deleteAndReplace(id: string, credentialsProvider: PoolBridgeCredentialsProvider): Promise<void>;
}

export function loadConfig(env?: NodeJS.ProcessEnv): PoolBridgeConfig;
export function createLogger(level?: string): PoolBridgeLogger;
export function startLogServer(
  log: PoolBridgeLogger,
  env?: NodeJS.ProcessEnv,
): string | null;
export function getLogServerUrl(): string | null;

export interface PoolState {
  groups: PoolGroup[];
  currentActiveId: string | null;
}
export const colors: Record<string, unknown>;
