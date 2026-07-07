import type { EventEmitter } from 'node:events';
import type { ReactElement } from 'react';
import { render } from 'ink-testing-library';
import { EnvironmentContext, EnvInfo } from '../lib/environment_context';
import { StdinContext, StdInSubscriptionManager } from '../lib/stdin_context';
import { UnifiedInputProvider } from '../lib/input/unified';
import { KeyHandlerProvider } from '../lib/key_handler';
import { KeymapProvider } from '../lib/keymap';
import {
  CommandComponentRegistryProvider,
  type CommandComponentRegistry,
} from '../lib/command_component_registry';
import { createSendInputFn } from './input_helper';

// Expose only the public surface of ink-testing-library's Stdout.
// The class has a private `_lastFrame` field that TypeScript won't let us
// re-export from a function return type, so we pick what tests actually need.
export type TestStdout = EventEmitter & {
  readonly frames: string[];
  write: (frame: string) => void;
  lastFrame: () => string | undefined;
  isTTY?: boolean;
};

const defaultTestEnvInfo: EnvInfo = {
  terminalName: 'test',
  isKittyProtocolSupported: false,
  duoCliVersion: '1.0.0',
  environment: 'development',
  distribution: 'npm',
  osPlatform: 'linux',
  osVersion: '5',
  theme: 'dark',
};

interface RenderWithProvidersOptions {
  envInfo?: Partial<EnvInfo>;
  commandComponentRegistry?: CommandComponentRegistry;
}

export function renderWithProviders(
  element: ReactElement,
  options: RenderWithProvidersOptions = {},
) {
  const { envInfo: envInfoOverrides, commandComponentRegistry } = options;
  const envInfo = { ...defaultTestEnvInfo, ...envInfoOverrides };
  const stdinManager = new StdInSubscriptionManager();

  const wrap = (el: ReactElement): ReactElement => (
    <StdinContext.Provider value={stdinManager}>
      <EnvironmentContext.Provider value={envInfo}>
        <UnifiedInputProvider>
          <KeyHandlerProvider>
            <KeymapProvider>
              <CommandComponentRegistryProvider value={commandComponentRegistry ?? new Map()}>
                {el}
              </CommandComponentRegistryProvider>
            </KeymapProvider>
          </KeyHandlerProvider>
        </UnifiedInputProvider>
      </EnvironmentContext.Provider>
    </StdinContext.Provider>
  );

  const result = render(wrap(element));
  const sendInput = createSendInputFn(stdinManager, result.stdin);

  return {
    lastFrame: result.lastFrame,
    frames: result.frames,
    unmount: result.unmount,
    stdin: result.stdin,
    stdout: result.stdout as TestStdout,
    sendInput,
    stdinManager,
    rerender: (newElement: ReactElement) => result.rerender(wrap(newElement)),
  };
}
