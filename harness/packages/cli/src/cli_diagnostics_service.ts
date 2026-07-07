import { Injectable, createInterfaceId } from '@gitlab/needle';
import { Logger } from '@gitlab-org/logging';
import { RuntimeContext } from './runtime_context';

interface ICliDiagnosticsService {
  logDebugDetails(): void;
}

export const CliDiagnosticsService =
  createInterfaceId<ICliDiagnosticsService>('CliDiagnosticsService');

@Injectable(CliDiagnosticsService, [Logger, RuntimeContext])
export class DefaultCliDiagnosticsService implements ICliDiagnosticsService {
  #logger: Logger;

  #runtimeContext: RuntimeContext;

  constructor(logger: Logger, runtimeContext: RuntimeContext) {
    this.#logger = logger;
    this.#runtimeContext = runtimeContext;
  }

  logDebugDetails(): void {
    const { terminalName, isKittyProtocolSupported, distribution, osPlatform, osVersion } =
      this.#runtimeContext.envInfo;
    const diagnostics = {
      cliVersion: this.#runtimeContext.cliVersion,
      arch: process.arch,
      nodeVersion: process.version,
      osPlatform,
      osVersion,
      terminalName,
      isKittyProtocolSupported,
      distribution,
    };
    this.#logger.info(`CLI environment details:\n${JSON.stringify(diagnostics, null, 4)}`);
  }
}
