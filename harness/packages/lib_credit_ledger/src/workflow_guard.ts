/**
 * Process-wide holder for the credit-ledger CircuitBreaker guard.
 *
 * The breaker is built at CLI boot (wireCreditLedgerPoolSwitch), but the two
 * outbound workflow call sites that must be wrapped — the DAP workflow
 * start/resume and the code-suggestions dispatch — live in packages that don't
 * take part in the cli DI graph. This tiny seam lets boot install the guard and
 * those sites consult it, defaulting to a pass-through when the pool bridge is
 * not enabled (so behaviour is unchanged in that case).
 */
type Guard = <T>(fn: () => Promise<T>) => Promise<T>;

let activeGuard: Guard | undefined;

export function setWorkflowGuard(guard: Guard): void {
  activeGuard = guard;
}

export function clearWorkflowGuard(): void {
  activeGuard = undefined;
}

/** Run `fn` through the circuit breaker if one is installed, else directly. */
export function guardWorkflowCall<T>(fn: () => Promise<T>): Promise<T> {
  return activeGuard ? activeGuard(fn) : fn();
}
