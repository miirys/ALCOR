/**
 * Drop only the two noisy Node deprecation warnings that otherwise print to
 * stderr during Ink's first paint and mangle the boot banner / leak the `^[[I`
 * focus escape:
 *   - DEP0040: the punycode module is deprecated
 *   - DEP0169: url.parse() is insecure/deprecated
 *
 * These come from transitive dependencies we don't control. Targeted here (per
 * warning code) instead of a blanket `--no-deprecation` so genuinely new
 * deprecations in our own code still surface. Imported first in the CLI entry
 * so the override is installed before any dependency can emit.
 */
const SUPPRESSED_CODES = new Set(['DEP0040', 'DEP0169']);

const originalEmitWarning = process.emitWarning.bind(process);

// process.emitWarning has two shapes Node uses for deprecations:
//   emitWarning(msg, { type, code })      — options-object form
//   emitWarning(msg, 'DeprecationWarning', 'DEP0040')  — (type, code) form
// Pull the code from either: a bare 'DEPxxxx' string arg, or an options.code.
function warningCode(rest: unknown[]): string | undefined {
  for (const arg of rest) {
    if (typeof arg === 'string' && /^DEP\d+$/.test(arg)) return arg;
    if (arg && typeof arg === 'object' && typeof (arg as { code?: string }).code === 'string') {
      return (arg as { code?: string }).code;
    }
  }
  return undefined;
}

process.emitWarning = ((warning: string | Error, ...rest: unknown[]): void => {
  const code = warningCode(rest);
  if (code && SUPPRESSED_CODES.has(code)) return;
  (originalEmitWarning as (w: string | Error, ...r: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;
