/**
 * React hook and helpers for unified input system
 *
 * This hook:
 * - Registers a listener with the UnifiedInputSystem
 * - Handles cleanup on unmount
 * - Supports isActive option to temporarily disable listening
 * - Uses refs to avoid re-registration when listener changes
 */

import { useContext, useEffect, useRef } from 'react';
import { UnifiedInputContext } from './unified_input_context';
import type { ParsedKey } from './types';

type FilterFunction = (key: ParsedKey) => boolean;

/**
 * Default filter that ignores all 'release' events
 * This is the most common filter for UI interactions
 */
const ignoreRelease: FilterFunction = (key: ParsedKey) => key.eventType !== 'release';

/**
 * Hook to register a listener for key events
 *
 * @param listener - Function to call when a key event passes the filter
 * @param filter - Optional filter function to decide which events to handle (defaults to ignoreRelease)
 *
 * @example
 * ```tsx
 * // Default: ignore release events
 * useUnifiedInput((key) => {
 *   if (KeyChecks.isEnter(key)) handleSubmit();
 * });
 *
 * // Handle all events (no filtering)
 * useUnifiedInput((key) => {
 *   console.log('Event:', key.eventType, key.name);
 * }, () => true);
 * ```
 */
export const useUnifiedInput = (
  listener: (key: ParsedKey) => void,
  filter: FilterFunction = ignoreRelease,
): void => {
  const system = useContext(UnifiedInputContext);
  const listenerRef = useRef(listener);
  const filterRef = useRef(filter);

  useEffect(() => {
    listenerRef.current = listener;
  }, [listener]);

  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  useEffect(() => {
    const disposable = system.onKey((key) => {
      if (filterRef.current(key)) {
        listenerRef.current(key);
      }
    });

    return () => disposable.dispose();
  }, [system]);
};
