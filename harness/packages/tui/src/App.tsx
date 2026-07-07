import React, { useContext, useEffect } from 'react';
import { ChatInterface } from './ChatInterface';
import type { AppState, AppCallbacks } from './types';
import type { DropdownProvider } from './lib/dropdown_provider';
import {
  CommandComponentRegistryProvider,
  type CommandComponentRegistry,
} from './lib/command_component_registry';
import { UnifiedInputContext } from './lib/input/unified/unified_input_context';

interface AppProps {
  state: AppState;
  callbacks: AppCallbacks;
  dropdownProviders?: DropdownProvider[];
  commandComponentRegistry?: CommandComponentRegistry;
}

export const App: React.FC<AppProps> = ({
  state,
  callbacks,
  dropdownProviders,
  commandComponentRegistry,
}) => {
  const inputSystem = useContext(UnifiedInputContext);
  const { onFocusChange } = callbacks;

  // Forward terminal focus changes to the controller so it can suppress notifications
  // while the terminal is focused.
  useEffect(() => {
    if (!onFocusChange) return undefined;
    const disposable = inputSystem.onFocusChange(onFocusChange);
    return () => disposable.dispose();
  }, [inputSystem, onFocusChange]);

  return (
    <CommandComponentRegistryProvider value={commandComponentRegistry ?? new Map()}>
      <ChatInterface state={state} callbacks={callbacks} dropdownProviders={dropdownProviders} />
    </CommandComponentRegistryProvider>
  );
};
