import { App, renderTuiApp, type AppState, type EnvInfo } from '@gitlab-org/tui';
import { type Logger } from '@gitlab-org/logging';
import React, { useState, useEffect } from 'react';
import { Text } from 'ink';
import { doNotAwait } from '@gitlab-org/core';
import type { ExitHandler } from '../../utils/exit';
import { TUIController } from './tui_controller';

const Main: React.FC<{ controller: TUIController }> = ({ controller }) => {
  const [appState, setAppState] = useState<AppState | undefined>(undefined);

  useEffect(() => {
    doNotAwait(controller.initialize(setAppState));
  }, [controller]);

  if (!appState) {
    return <Text>Initializing...</Text>;
  }

  return (
    <App
      state={appState}
      callbacks={controller.getCallbacks()}
      dropdownProviders={controller.getDropdownProviders()}
      commandComponentRegistry={controller.getCommandComponentRegistry()}
    />
  );
};

export const renderApp = (
  controller: TUIController,
  envInfo: EnvInfo,
  exitHandler: ExitHandler,
  logger: Logger,
) => {
  const tuiHandle = renderTuiApp(<Main controller={controller} />, envInfo, logger);

  exitHandler.setTuiCleanup(async () => {
    tuiHandle.unmount();
    await tuiHandle.waitUntilExit;
  });

  exitHandler.setTuiResume(() => tuiHandle.resume());

  tuiHandle.waitUntilExit
    .then(() => exitHandler.exit(0))
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      return exitHandler.exit(1);
    });
};
