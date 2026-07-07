// Provider-agnostic; `desktop_*` adapters map the SDK's native event shape to this.
export interface SandboxViolation {
  description: string;
  timestamp: Date;
}
