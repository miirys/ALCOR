import { useEffect, useRef } from 'react';
import { useKeyHandlerManager } from './key_handler_context';
import type { KeyHandler } from './types';

export function useKeyHandler(handler: KeyHandler): void {
  const keyHandlerManager = useKeyHandlerManager();
  const handlerRef = useRef(handler);

  // Keep ref up to date with latest handler
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    // Wrapper that always calls the latest handler from the ref
    const wrappedHandler: KeyHandler = (...args) => handlerRef.current(...args);
    const unsubscribe = keyHandlerManager.addHandler(wrappedHandler);
    return unsubscribe;
  }, [keyHandlerManager]);
}
