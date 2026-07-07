import { ConfigurationApp, EnvInfo, renderTuiApp } from '@gitlab-org/tui';
import { type Logger } from '@gitlab-org/logging';
import type { ExitHandler } from '../../utils/exit';
import { ConfigurationController } from './configuration_controller';

export const renderConfig = (
  controller: ConfigurationController,
  envInfo: EnvInfo,
  exitHandler: ExitHandler,
  logger: Logger,
) => {
  const tuiHandle = renderTuiApp(
    <ConfigurationApp initialState={controller.getConfigurationModel()} controller={controller} />,
    envInfo,
    logger,
  );

  exitHandler.setTuiCleanup(async () => {
    tuiHandle.unmount();
    await tuiHandle.waitUntilExit;
  });

  controller.setExitHandler(exitHandler);

  tuiHandle.waitUntilExit.then(() => exitHandler.exit(0)).catch(() => exitHandler.exit(1));
};
