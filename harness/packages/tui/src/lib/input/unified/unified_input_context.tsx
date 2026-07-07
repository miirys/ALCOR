import { useContext, useEffect, useState, createContext } from 'react';
import type { ReactNode } from 'react';
import { StdinContext } from '../../stdin_context';
import { EnvironmentContext } from '../../environment_context';
import { UnifiedInputSystem } from './unified_input_system';

export const UnifiedInputContext = createContext<UnifiedInputSystem>(new UnifiedInputSystem());

interface UnifiedInputProviderProps {
  children: ReactNode;
  /**
   * Input system to use. Read once on mount and held for the provider's lifetime, so it must be
   * a stable instance — passing a different one on re-render has no effect. Defaults to a fresh
   * system. Used by the host to wire suspend handling onto the same instance the app sees.
   */
  inputSystem?: UnifiedInputSystem;
}

/**
 * Provider that creates a single stdin subscription for the entire app
 */
export const UnifiedInputProvider: React.FC<UnifiedInputProviderProps> = ({
  children,
  inputSystem,
}) => {
  const stdinManager = useContext(StdinContext);
  const { isKittyProtocolSupported } = useContext(EnvironmentContext);
  const [system] = useState(() => inputSystem ?? new UnifiedInputSystem());

  // Configure kitty protocol support
  useEffect(() => {
    system.setKittyProtocol(isKittyProtocolSupported);
  }, [isKittyProtocolSupported, system]);

  // Subscribe to stdin and delegate to system
  useEffect(() => {
    const handleStdin = (buffer: Buffer) => {
      system.processRawInput(buffer);
    };

    stdinManager.subscribe(handleStdin);

    return () => {
      stdinManager.unsubscribe(handleStdin);
    };
  }, [stdinManager, system]);

  return <UnifiedInputContext.Provider value={system}>{children}</UnifiedInputContext.Provider>;
};
