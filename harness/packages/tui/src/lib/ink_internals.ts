/**
 * Ink keeps its instance in an internal WeakMap that its `exports` field
 * doesn't expose. captureInkInstance() snags it during render() by
 * monkey-patching WeakMap.prototype.set for the synchronous body of the
 * call. Everything else here mutates that captured instance directly.
 *
 * !! Temporary — deleted with the open-tui migration. !!
 */

export type InkInternals = {
  fullStaticOutput?: string;
  lastOutput: string;
  lastOutputToRender?: string;
};

const looksLikeInkInstance = (value: unknown): value is InkInternals => {
  return typeof value === 'object' && value !== null && 'fullStaticOutput' in (value as object);
};

// ansiEscapes.clearTerminal: erase viewport + scrollback, home cursor.
const CLEAR_TERMINAL = '\x1b[2J\x1b[3J\x1b[H';

/**
 * Patch WeakMap.prototype.set for one call to capture Ink's instance.
 * The discriminator (key === stream && has 'fullStaticOutput') lets
 * unrelated WeakMap activity pass through.
 */
export const captureInkInstance = <T>(
  stream: NodeJS.WriteStream,
  renderFn: () => T,
): { result: T; ink: InkInternals | undefined } => {
  const originalSet = WeakMap.prototype.set;
  let captured: InkInternals | undefined;

  // eslint-disable-next-line no-extend-native, func-names
  WeakMap.prototype.set = function (this: WeakMap<object, unknown>, key: object, value: unknown) {
    if (key === stream && looksLikeInkInstance(value)) {
      captured = value;
    }
    return originalSet.call(this, key, value);
  } as typeof WeakMap.prototype.set;

  try {
    const result = renderFn();
    return { result, ink: captured };
  } finally {
    // eslint-disable-next-line no-extend-native
    WeakMap.prototype.set = originalSet;
  }
};

let activeInk: InkInternals | undefined;
let activeStream: NodeJS.WriteStream | undefined;

export const setActiveInkInstance = (
  ink: InkInternals | undefined,
  stream: NodeJS.WriteStream | undefined,
): void => {
  activeInk = ink;
  activeStream = stream;
};

/**
 * Zero <Static>'s accumulator before forcing a remount, so re-emitted
 * items don't append on top of stale content.
 */
export const clearStaticOutput = (): void => {
  if (activeInk) activeInk.fullStaticOutput = '';
};

/**
 * Wipe scrollback and re-emit Ink's current buffers. Call from a layout
 * effect right after a <Static> remount.
 *
 * DOES NOT call onRender: in legacy sync mode, <Static>'s scheduled
 * setIndex(items.length) hasn't applied yet, so a fresh render would
 * re-emit items and double-append to fullStaticOutput.
 */
export const replayCurrentFrame = (): void => {
  const ink = activeInk;
  const stream = activeStream;
  if (!ink || !stream) return;
  const frame = ink.lastOutputToRender ?? ink.lastOutput ?? '';
  stream.write(CLEAR_TERMINAL + (ink.fullStaticOutput ?? '') + frame);
};
