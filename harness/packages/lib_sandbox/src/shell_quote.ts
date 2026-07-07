// POSIX-shell quote one argument. The sandbox provider passes commands through
// `bash -c`, so paths with spaces or parens (e.g. VS Code's `Code Helper (Plugin)`) must be escaped.
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
