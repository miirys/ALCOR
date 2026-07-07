export interface MetadataKey<T> {
  readonly __type: T;
  readonly symbol: unique symbol;
}

export const createMetadataKey = <T>(name: string): MetadataKey<T> =>
  ({
    symbol: Symbol(name),
  }) as MetadataKey<T>;

export const getMetadata = <T>(target: object, key: MetadataKey<T>): T | undefined => {
  return (target as Record<symbol, T>)[key.symbol];
};

export const setMetadata = <T>(target: object, key: MetadataKey<T>, value: T): void => {
  if (!(key.symbol in target)) {
    Object.defineProperty(target, key.symbol, {
      value,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
};
