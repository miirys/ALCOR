/** Extract the short varName from an internal context path (e.g. `context:id.field` → `field`). */
export function deriveVarName(path: string): string {
  if (path.includes('.')) return path.split('.').pop() ?? path;
  if (path.includes(':')) return path.split(':').pop() ?? path;
  return path;
}

/** Default attrs for an unresolved `{{varName}}` merge field. */
export function createUnknownMergeFieldAttrs(varName: string) {
  return {
    path: varName,
    varName,
    displayLabel: '',
    sourceNodeType: '',
    status: 'unknown' as const,
  };
}
