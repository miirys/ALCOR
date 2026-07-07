/** Creates an async generator that yields each item from the given array in order. */
export async function* asyncGeneratorFromArray<T>(items: T[]): AsyncGenerator<T, void, unknown> {
  for (const item of items) {
    yield item;
  }
}

/** Drains an async iterable and collects all yielded values into an array. */
export async function collectAsyncGenerator<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of gen) {
    items.push(item);
  }
  return items;
}

/** Exhausts an async iterable, discarding all yielded values. */
export async function drainAsyncGenerator(gen: AsyncIterable<unknown>): Promise<void> {
  await collectAsyncGenerator(gen);
}
