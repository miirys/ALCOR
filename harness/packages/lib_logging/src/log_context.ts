export interface LogContext {
  name: string;
  value?: string;
  children?: LogContext[];
}

export const logCtxItem = (name: string, value: string): LogContext => ({
  name,
  value,
});

export const logCtxParent = (
  name: string,
  ...children: (LogContext | undefined)[]
): LogContext => ({
  name,
  children: children.filter((ch) => ch !== undefined),
});

/** if multiple context parameters are defined, we join them otherwise we return a single context or undefined */
export const joinContextsIfDefined = (name: string, ...contexts: (LogContext | undefined)[]) => {
  const definedContexts = contexts.filter((c) => c !== undefined);
  if (definedContexts.length === 0) return undefined;
  if (definedContexts.length === 1) return definedContexts[0];
  return logCtxParent(name, ...definedContexts);
};
