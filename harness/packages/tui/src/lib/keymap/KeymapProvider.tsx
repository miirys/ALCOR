import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useKeyHandler, type KeyEvent } from '../key_handler';
import type { InputAction } from './actions';
import { DEFAULT_INPUT_KEYMAP_CONTEXT, type InputKeymapContext } from './context';
import { resolve } from './keymap';

type ActionFn = () => void | Promise<void>;

interface KeymapApi {
  /** Register an action handler; returns an unregister function. */
  register: (action: InputAction, fn: ActionFn) => () => void;
  /** Merge fields into the central context; returns a cleanup function. */
  publish: (partial: Partial<InputKeymapContext>) => () => void;
}

const KeymapContext = createContext<KeymapApi | null>(null);

interface KeymapProviderProps {
  children: ReactNode;
}

export const KeymapProvider: React.FC<KeymapProviderProps> = ({ children }) => {
  // The registry maps each action id to the set of registered handlers. The
  // most recently registered handler wins, which keeps behaviour stable when a
  // component remounts and re-registers the same action.
  const registryRef = useRef<Map<InputAction, ActionFn[]>>(new Map());
  // Each publisher owns a slice of the central context, keyed by a stable token.
  const publishersRef = useRef<Map<symbol, Partial<InputKeymapContext>>>(new Map());
  // The latest resolved context, read synchronously by the dispatcher.
  const contextRef = useRef<InputKeymapContext>(DEFAULT_INPUT_KEYMAP_CONTEXT);

  const api = useMemo<KeymapApi>(() => {
    const recomputeContext = () => {
      let next = { ...DEFAULT_INPUT_KEYMAP_CONTEXT };
      for (const partial of publishersRef.current.values()) {
        next = { ...next, ...partial };
      }
      contextRef.current = next;
    };

    return {
      register(action, fn) {
        const list = registryRef.current.get(action) ?? [];
        list.push(fn);
        registryRef.current.set(action, list);
        return () => {
          const current = registryRef.current.get(action);
          if (!current) return;
          const index = current.indexOf(fn);
          if (index !== -1) current.splice(index, 1);
          if (current.length === 0) registryRef.current.delete(action);
        };
      },
      publish(partial) {
        const token = Symbol('keymap-publisher');
        publishersRef.current.set(token, partial);
        recomputeContext();
        return () => {
          publishersRef.current.delete(token);
          recomputeContext();
        };
      },
    };
  }, []);

  useKeyHandler(async (event: KeyEvent) => {
    const action = resolve(event, contextRef.current);
    if (!action) return;
    const handlers = registryRef.current.get(action);
    const fn = handlers && handlers[handlers.length - 1];
    if (fn) {
      event.stopPropagation();
      await fn();
    }
  });

  return <KeymapContext.Provider value={api}>{children}</KeymapContext.Provider>;
};

function useKeymapApi(): KeymapApi {
  const api = useContext(KeymapContext);
  if (!api) {
    throw new Error('useKeymapApi must be used within KeymapProvider');
  }
  return api;
}

/**
 * Register `fn` as the handler for `action` while `enabled` is true.
 *
 * Ref-backed like `useKeyHandler` so the latest closure is always invoked
 * without re-registering on every render.
 */
export function useInputAction(action: InputAction, fn: ActionFn, enabled = true): void {
  const api = useKeymapApi();
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return undefined;
    return api.register(action, () => fnRef.current());
  }, [api, action, enabled]);
}

/**
 * Merge `partial` fields into the central keymap context.
 *
 * Destructures the known primitive fields so the effect only re-runs when the
 * published values change, not on every render (callers pass a fresh object
 * literal each time). Only the keys a caller actually provides are published.
 */
export function usePublishInputContext(partial: Partial<InputKeymapContext>): void {
  const api = useKeymapApi();
  const { inputType, isLoading, dropdownOpen, messageEmpty, hasQueuedPrompt, onboardingActive } =
    partial;

  useEffect(() => {
    const slice: Partial<InputKeymapContext> = {};
    if (inputType !== undefined) slice.inputType = inputType;
    if (isLoading !== undefined) slice.isLoading = isLoading;
    if (dropdownOpen !== undefined) slice.dropdownOpen = dropdownOpen;
    if (messageEmpty !== undefined) slice.messageEmpty = messageEmpty;
    if (hasQueuedPrompt !== undefined) slice.hasQueuedPrompt = hasQueuedPrompt;
    if (onboardingActive !== undefined) slice.onboardingActive = onboardingActive;
    return api.publish(slice);
  }, [api, inputType, isLoading, dropdownOpen, messageEmpty, hasQueuedPrompt, onboardingActive]);
}
