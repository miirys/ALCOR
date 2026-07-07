import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { CLI_INPUT_TYPES, defaultInputState, type HelpDialogCallbacks } from '@gitlab-org/tui';
import type { ControllerApi } from '../commands/tui/controller_api';

export interface HelpController {
  openHelp(api: ControllerApi): void;
  closeHelp(api: ControllerApi): void;
  getCallbacks(api: ControllerApi): HelpDialogCallbacks;
}

export const HelpController = createInterfaceId<HelpController>('HelpController');

@Implements(HelpController)
@Service({
  dependencies: [],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultHelpController implements HelpController {
  openHelp(api: ControllerApi): void {
    const commands = api.getCommands();
    api.mutateState((state) => ({
      ...state,
      input: {
        inputType: CLI_INPUT_TYPES.HELP_DIALOG,
        slashCommands: commands,
      },
    }));
  }

  closeHelp(api: ControllerApi): void {
    api.mutateState((state) => ({ ...state, input: defaultInputState }));
  }

  getCallbacks(api: ControllerApi): HelpDialogCallbacks {
    return {
      onCloseHelp: () => this.closeHelp(api),
    };
  }
}
