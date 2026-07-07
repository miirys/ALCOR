import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  CLI_INPUT_TYPES,
  defaultInputState,
  type DiagnosticsDialogCallbacks,
} from '@gitlab-org/tui';
import type { ControllerApi } from '../tui/controller_api';
import { DiagnosticsReporter } from './diagnostics_reporter';

export interface DoctorController {
  open(api: ControllerApi): Promise<void>;
  close(api: ControllerApi): void;
  getCallbacks(api: ControllerApi): DiagnosticsDialogCallbacks;
}

export const DoctorController = createInterfaceId<DoctorController>('DoctorController');

@Implements(DoctorController)
@Service({
  dependencies: [DiagnosticsReporter, Logger],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultDoctorController implements DoctorController {
  #reporter: DiagnosticsReporter;

  #logger: Logger;

  constructor(reporter: DiagnosticsReporter, logger: Logger) {
    this.#reporter = reporter;
    this.#logger = withPrefix(logger, '[DoctorController]');
  }

  async open(api: ControllerApi): Promise<void> {
    let content: string;
    try {
      content = await this.#reporter.report();
    } catch (error) {
      this.#logger.error('Failed to render diagnostics report', error);
      api.showError(
        `Failed to render diagnostics: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    api.mutateState((state) => ({
      ...state,
      input: {
        inputType: CLI_INPUT_TYPES.DIAGNOSTICS_DIALOG,
        content,
      },
    }));
  }

  close(api: ControllerApi): void {
    api.mutateState((state) => ({ ...state, input: defaultInputState }));
  }

  getCallbacks(api: ControllerApi): DiagnosticsDialogCallbacks {
    return {
      onClose: () => this.close(api),
    };
  }
}
