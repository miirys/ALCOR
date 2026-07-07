import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStdout } from 'ink';
import { clearStaticOutput, replayCurrentFrame } from '../ink_internals';

/**
 * Returns a nonce to use as <Static>'s `key`, bumped on resize and session
 * change to remount it and redraw cleanly.
 *
 * Ink accumulates <Static>'s emitted items in `fullStaticOutput` and never
 * un-emits them, so a bare remount re-appends stale content to the scrollback
 * (duplicated output on /new — #2416). Clearing the accumulator here, before
 * the nonce bump triggers the remount, makes the fresh <Static> re-emit onto
 * an empty accumulator — which a `key={sessionId}` ancestor remount can't do,
 * as Ink re-emits synchronously during commit, before any effect can clear.
 */
export function useStaticReset(sessionId: string | undefined): number {
  const { stdout } = useStdout();
  const [nonce, setNonce] = useState(0);

  // Reflow frozen items on terminal resize.
  useEffect(() => {
    if (!stdout) return undefined;
    const handleResize = () => {
      clearStaticOutput();
      setNonce((n) => n + 1);
    };
    stdout.on('resize', handleResize);
    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  // Reset when switching between established sessions (e.g. /new). Skip the
  // initial assignment (undefined -> first session), which isn't a switch.
  const prevSessionId = useRef(sessionId);
  useLayoutEffect(() => {
    const prev = prevSessionId.current;
    prevSessionId.current = sessionId;
    if (prev === undefined || prev === sessionId) return;
    clearStaticOutput();
    setNonce((n) => n + 1);
  }, [sessionId]);

  // Redraw the current frame over a cleared terminal after any remount.
  useLayoutEffect(() => {
    if (nonce === 0) return;
    replayCurrentFrame();
  }, [nonce]);

  return nonce;
}
