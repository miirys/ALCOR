import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { UnifiedInputContext } from '../input/unified/unified_input_context';
import { KeyHandlerManager } from './key_handler_manager';

export const KeyHandlerContext = createContext<KeyHandlerManager | null>(null);

interface KeyHandlerProviderProps {
  children: ReactNode;
}

export const KeyHandlerProvider: React.FC<KeyHandlerProviderProps> = ({ children }) => {
  const unifiedInput = useContext(UnifiedInputContext);
  const [keyHandlerManager] = useState(() => new KeyHandlerManager(unifiedInput));

  useEffect(() => {
    return () => {
      keyHandlerManager.dispose();
    };
  }, [keyHandlerManager]);

  return (
    <KeyHandlerContext.Provider value={keyHandlerManager}>{children}</KeyHandlerContext.Provider>
  );
};

export function useKeyHandlerManager(): KeyHandlerManager {
  const manager = useContext(KeyHandlerContext);
  if (!manager) {
    throw new Error('useKeyHandlerManager must be used within KeyHandlerProvider');
  }
  return manager;
}
