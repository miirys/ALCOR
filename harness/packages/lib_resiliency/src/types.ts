export type Operation<T> = (signal: AbortSignal) => Promise<T>;
