import { useEffect, useRef } from 'react';

type Callback = () => void;

// Implementation is credited to Dan Abramov's blog post: https://overreacted.io/making-setinterval-declarative-with-react-hooks/

export function useInterval(callback: Callback, delay: number | null) {
  const savedCallback = useRef<Callback>(callback);

  // Remember the latest callback.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval.
  useEffect(() => {
    function tick() {
      savedCallback.current();
    }
    if (delay !== null) {
      const id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
    return undefined;
  }, [delay]);
}
