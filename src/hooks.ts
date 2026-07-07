import { useEffect, useRef, useState } from 'react';
import { useStdout } from 'ink';

/** Ticks a frame counter at the given fps. Drives all animations. */
export function useFrame(fps = 12, running = true): number {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setFrame((f) => f + 1), 1000 / fps);
    return () => clearInterval(id);
  }, [fps, running]);
  return frame;
}

/** Seconds elapsed since mount (1 decimal), updating live. */
export function useElapsed(running = true): number {
  const start = useRef(Date.now());
  const frame = useFrame(4, running);
  void frame;
  return Math.round((Date.now() - start.current) / 100) / 10;
}

/** Reveals text progressively, like token streaming. */
export function useTypewriter(text: string, cps = 220, enabled = true) {
  const [n, setN] = useState(enabled ? 0 : text.length);
  useEffect(() => {
    if (!enabled) {
      setN(text.length);
      return;
    }
    setN(0);
    const step = Math.max(1, Math.round(cps / 30));
    const id = setInterval(() => {
      setN((v) => {
        if (v >= text.length) {
          clearInterval(id);
          return v;
        }
        return Math.min(text.length, v + step);
      });
    }, 1000 / 30);
    return () => clearInterval(id);
  }, [text, cps, enabled]);
  return { visible: text.slice(0, n), done: n >= text.length };
}

/** Terminal dimensions, live-updating on resize. */
export function useTermSize(): { columns: number; rows: number } {
  const { stdout } = useStdout();
  const [size, setSize] = useState({
    columns: stdout?.columns ?? 100,
    rows: stdout?.rows ?? 30,
  });
  useEffect(() => {
    if (!stdout) return;
    const onResize = () =>
      setSize({ columns: stdout.columns, rows: stdout.rows });
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);
  return size;
}

/** Runs a staged script: fires callback(stepIndex) after cumulative delays. */
export function useScript(steps: number[], onStep: (i: number) => void, deps: unknown[] = []) {
  useEffect(() => {
    const ids: NodeJS.Timeout[] = [];
    let acc = 0;
    steps.forEach((ms, i) => {
      acc += ms;
      ids.push(setTimeout(() => onStep(i), acc));
    });
    return () => ids.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
