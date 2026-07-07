type MutableVersions = Record<string, string | undefined>;

/**
 * Test helper for toggling Bun-runtime detection (`process.versions.bun`).
 *
 * Call once at `describe` scope. It captures the original value, registers
 * an `afterEach` that restores it, and returns a setter to switch the
 * runtime on or off per test.
 *
 * @example
 * ```typescript
 *   const setBunRuntime = mockBunRuntime();
 *
 *   it('does the Bun thing', () => {
 *     setBunRuntime(true);
 *     // ...
 *   });
 * ```
 */
export const mockBunRuntime = (): ((enabled: boolean) => void) => {
  const originalBun = process.versions.bun;

  afterEach(() => {
    if (originalBun === undefined) {
      delete (process.versions as MutableVersions).bun;
    } else {
      (process.versions as MutableVersions).bun = originalBun;
    }
  });

  return (enabled: boolean) => {
    if (enabled) {
      (process.versions as MutableVersions).bun = '1.2.3';
    } else {
      delete (process.versions as MutableVersions).bun;
    }
  };
};
