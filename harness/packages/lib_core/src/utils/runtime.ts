/**
 * Returns true when running under the Bun runtime.
 *
 * Use this to switch behaviour that depends on runtime-specific APIs
 * (e.g. Bun's native WebSocket ignores Node's `agent` option and instead
 * accepts `proxy` / `tls`).
 */
export function isBunRuntime(): boolean {
  return typeof process.versions.bun === 'string';
}
