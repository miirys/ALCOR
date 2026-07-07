import { useEffect, useRef, useState } from 'react';
import { useInputAction } from '../keymap';

export type CancelState = 'ready' | 'cancelling' | 'stopped';

export const CANCEL_HINT: Record<CancelState, string> = {
  ready: '*Esc* to cancel',
  cancelling: 'Cancelling… (*Esc* again to force stop)',
  stopped: 'Stopped.',
};

// Second ESC within this window (of the first) escalates to force-stop.
const FORCE_STOP_WINDOW_MS = 1_500;
// Hard cap: if no settlement event arrives, stop showing "cancelling…".
const CANCEL_TIMEOUT_MS = 5_000;
// How long "Stopped." lingers before returning to the ready hint.
const STOPPED_LINGER_MS = 1_000;

/**
 * ESC-driven cancel / force-stop during a loading stream. No confirm step.
 *
 * State machine (Esc only reaches here while a stream is active — the keymap
 * routes `stream.cancel` to this hook only while loading; otherwise Esc clears
 * the input buffer via a different action, and ctrl-c keeps Ink's default
 * exit behaviour, untouched):
 *
 *   ready → (Esc)                         → cancelling  [calls onCancelStream immediately]
 *   cancelling → (Esc within 1500ms)      → force-stop  [calls onForceStop]
 *   cancelling → (stream stops | 5s cap)  → stopped     → (1s) → ready
 *
 * "cancelling" stays true until the stream actually stops (isLoading flips
 * false — driven by the backend's cancelled / force_stopped event) or the 5s
 * hard timeout elapses, so success is visible and the UI never wedges.
 */
export function useCancelStream(
  isLoading: boolean,
  hasQueuedPrompt: boolean,
  onCancelStream: () => void,
  onForceStop: () => void,
): CancelState {
  const [cancelState, setCancelState] = useState<CancelState>('ready');

  // Refs avoid stale closures when a second keypress races the re-render.
  const stateRef = useRef(cancelState);
  stateRef.current = cancelState;
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;
  const firstEscAtRef = useRef(0);

  useInputAction('stream.cancel', () => {
    const now = Date.now();
    if (stateRef.current === 'ready') {
      // No active stream → do nothing (Esc belongs to input-clear then).
      if (!isLoadingRef.current) return;
      firstEscAtRef.current = now;
      setCancelState('cancelling');
      onCancelStream();
    } else if (stateRef.current === 'cancelling') {
      // Second Esc within the window escalates to a hard force-stop.
      if (now - firstEscAtRef.current <= FORCE_STOP_WINDOW_MS) {
        onForceStop();
      }
    }
  });

  // Settlement: the stream actually stopped while we were cancelling.
  useEffect(() => {
    if (cancelState === 'cancelling' && !isLoading) {
      setCancelState('stopped');
    }
  }, [cancelState, isLoading]);

  // Hard timeout so "cancelling…" can't wedge if no settlement event arrives.
  useEffect(() => {
    if (cancelState !== 'cancelling') return undefined;
    const timer = setTimeout(() => setCancelState('stopped'), CANCEL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [cancelState]);

  // Briefly show "Stopped." then return to ready.
  useEffect(() => {
    if (cancelState !== 'stopped') return undefined;
    const timer = setTimeout(() => setCancelState('ready'), STOPPED_LINGER_MS);
    return () => clearTimeout(timer);
  }, [cancelState]);

  // A queued prompt rebinds Esc; reset so a stale cancelling state can't linger.
  useEffect(() => {
    if (hasQueuedPrompt) setCancelState('ready');
  }, [hasQueuedPrompt]);

  return cancelState;
}
