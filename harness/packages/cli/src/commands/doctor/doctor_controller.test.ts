import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { CLI_INPUT_TYPES, defaultInputState, type AppState } from '@gitlab-org/tui';
import type { ControllerApi, StateMutation } from '../tui/controller_api';
import { DefaultDoctorController } from './doctor_controller';
import { DiagnosticsReporter } from './diagnostics_reporter';

describe('DefaultDoctorController', () => {
  let reporter: DiagnosticsReporter;
  let api: ControllerApi;
  let controller: DefaultDoctorController;
  let mutations: AppState[];

  beforeEach(() => {
    mutations = [];

    reporter = createFakePartial<DiagnosticsReporter>({
      report: jest.fn<DiagnosticsReporter['report']>().mockResolvedValue('REPORT_BODY'),
    });

    api = createFakePartial<ControllerApi>({
      showError: jest.fn<ControllerApi['showError']>(),
      mutateState: jest
        .fn<ControllerApi['mutateState']>()
        .mockImplementation((m: StateMutation) => {
          const next = m(createFakePartial<AppState>({ input: defaultInputState }));
          mutations.push(next);
          return next;
        }),
    });

    controller = new DefaultDoctorController(reporter, new TestLogger());
  });

  it('open sets the diagnostics dialog input with the rendered report', async () => {
    await controller.open(api);

    expect(mutations).toHaveLength(1);
    expect(mutations[0].input).toEqual({
      inputType: CLI_INPUT_TYPES.DIAGNOSTICS_DIALOG,
      content: 'REPORT_BODY',
    });
  });

  it('close resets the input to default', () => {
    controller.close(api);

    expect(mutations).toHaveLength(1);
    expect(mutations[0].input).toEqual(defaultInputState);
  });

  it('surfaces an error and leaves state untouched if the reporter throws', async () => {
    jest.mocked(reporter.report).mockRejectedValueOnce(new Error('boom'));

    await controller.open(api);

    expect(api.showError).toHaveBeenCalledWith(expect.stringContaining('boom'));
    expect(mutations).toHaveLength(0);
  });
});
