import { ReactNode, StrictMode } from 'react';
import { render } from 'ink';
import { Logger } from '@gitlab-org/logging';
import { EnvInfo, EnvironmentContext } from './environment_context';
import { StdinContext, StdInSubscriptionManager } from './stdin_context';
import { UnifiedInputProvider, UnifiedInputSystem } from './input/unified';
import { createSuspendController } from './terminal_modes';
import { KeyHandlerProvider } from './key_handler';
import { KeymapProvider } from './keymap';
import { interceptConsole } from './console_interceptor';
import { captureInkInstance, setActiveInkInstance } from './ink_internals';
import { ErrorBoundary } from './error_boundary';

type CleanUpFunc = () => void;

export type TuiHandle = {
  unmount: () => void;
  waitUntilExit: Promise<void>;
  resume: () => void;
};

const ConditionalStrictMode: React.FC<{
  envInfo: EnvInfo;
  children: ReactNode;
}> = ({ envInfo, children }) => {
  if (envInfo.environment === 'development') {
    return <StrictMode>{children}</StrictMode>;
  }
  return <>{children}</>;
};

export const renderTuiApp = (node: ReactNode, envInfo: EnvInfo, logger: Logger): TuiHandle => {
  const isKittySupported = envInfo.isKittyProtocolSupported;
  const cleanUpFunctions: CleanUpFunc[] = [];

  const cleanUp = () => cleanUpFunctions.reverse().forEach((doCleanUp) => doCleanUp());

  // Owns the TUI's TTY modes (title, bracketed paste, focus reporting, raw mode, kitty protocol)
  // and the Ctrl+Z suspend / SIGCONT resume lifecycle. The modes are defined once in
  // terminal_modes.ts and shared with withSuspendedTty.
  const suspendController = createSuspendController({ isKittySupported });
  cleanUpFunctions.push(() => suspendController.cleanup());

  // Ctrl+Z is swallowed by raw mode, so suspend is driven from the parsed input stream.
  const inputSystem = new UnifiedInputSystem();
  const suspendSubscription = inputSystem.onSuspend(() => suspendController.suspend());
  cleanUpFunctions.push(() => suspendSubscription.dispose());

  const stdinManager = new StdInSubscriptionManager();
  stdinManager.startStdinListening();
  cleanUpFunctions.push(() => stdinManager.dispose());

  // Intercept console methods to filter unwanted output and route through Logger
  // This must happen BEFORE Ink renders, and we disable Ink's patchConsole
  const restoreConsole = interceptConsole(logger);
  cleanUpFunctions.push(restoreConsole);

  // Enable synchronized output: wrap stdout.write so each Ink render frame
  // is displayed atomically, preventing flicker from multi-line updates.
  // Terminals that don't support mode 2026 silently ignore the markers.
  const SYNC_START = '\x1b[?2026h';
  const SYNC_END = '\x1b[?2026l';
  const origWrite = process.stdout.write;
  process.stdout.write = new Proxy(origWrite, {
    apply(target, thisArg, argsList: [unknown, ...unknown[]]) {
      const [chunk, ...rest] = argsList;
      if (typeof chunk === 'string' && chunk.includes('\x1b[')) {
        return Reflect.apply(target, thisArg, [SYNC_START + chunk + SYNC_END, ...rest]);
      }
      return Reflect.apply(target, thisArg, argsList);
    },
  });
  cleanUpFunctions.push(() => {
    process.stdout.write = origWrite;
  });

  const AppWithContext = (
    <ErrorBoundary>
      <StdinContext value={stdinManager}>
        <EnvironmentContext value={envInfo}>
          <UnifiedInputProvider inputSystem={inputSystem}>
            <KeyHandlerProvider>
              <KeymapProvider>
                <ConditionalStrictMode envInfo={envInfo}>{node}</ConditionalStrictMode>
              </KeymapProvider>
            </KeyHandlerProvider>
          </UnifiedInputProvider>
        </EnvironmentContext>
      </StdinContext>
    </ErrorBoundary>
  );

  const { result: inkInstance, ink } = captureInkInstance(process.stdout, () =>
    render(AppWithContext, {
      // Disable Ink's default Ctrl+C handling - let the app handle it internally
      exitOnCtrlC: false,
      // Reducing the refresh rate to reduce flicker on some terminals
      // https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/1652#note_3016687566
      maxFps: 20,
      // Disable Ink's console patching - we handle it ourselves above
      patchConsole: false,
    }),
  );

  if (!ink) {
    logger.warn('Failed to capture Ink instance — terminal resize will not work correctly');
  }
  setActiveInkInstance(ink, process.stdout);

  const waitUntilExit: Promise<void> = (async () => {
    try {
      await inkInstance.waitUntilExit();
    } finally {
      cleanUp();
    }
  })();

  return {
    unmount: () => inkInstance.unmount(),
    waitUntilExit,
    resume: () => suspendController.resume(),
  };
};
