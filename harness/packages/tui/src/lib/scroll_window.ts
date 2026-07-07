export interface ScrollWindow<T> {
  visibleItems: T[];
  windowStart: number;
  windowEnd: number;
  showScrollUp: boolean;
  showScrollDown: boolean;
}

/**
 * Compute a visible window of items around `focusedIndex` that fits
 * within a row budget. Expands backward from focus first, then forward,
 * so the focused item sits at the bottom of the window until the
 * viewport can no longer scroll further.
 *
 * @param measureItem - Optional callback returning how many rows a single item occupies
 * (e.g. for when a large line of text is wrapped by the terminal's native line-wrap).
 * Defaults to `() => 1`.
 */
export function computeScrollWindow<T>(
  items: T[],
  focusedIndex: number,
  maxVisible: number,
  measureItem: (item: T) => number = () => 1,
): ScrollWindow<T> {
  const budget = Math.max(0, maxVisible);

  if (items.length === 0 || budget === 0) {
    return {
      visibleItems: [],
      windowStart: 0,
      windowEnd: 0,
      showScrollUp: false,
      showScrollDown: false,
    };
  }

  const focus = Math.max(0, Math.min(focusedIndex, items.length - 1));

  let windowStart = focus;
  let windowEnd = focus + 1;
  let usedRows = measureItem(items[focus]);

  while (windowStart > 0) {
    const cost = measureItem(items[windowStart - 1]);
    if (usedRows + cost > budget) break;
    usedRows += cost;
    windowStart--;
  }

  while (windowEnd < items.length) {
    const cost = measureItem(items[windowEnd]);
    if (usedRows + cost > budget) break;
    usedRows += cost;
    windowEnd++;
  }

  return {
    visibleItems: items.slice(windowStart, windowEnd),
    windowStart,
    windowEnd,
    showScrollUp: windowStart > 0,
    showScrollDown: windowEnd < items.length,
  };
}
