import { getTestToken } from './test_utils';
import { recordedTest } from './recorded_test';

describe('Doctor TUI E2E', () => {
  const ctx = recordedTest();

  it('opens /doctor, renders diagnostics sections, and closes on Esc', async () => {
    const chat = ctx.launchChat({
      cliOptions: { gitlabAuthToken: getTestToken() },
    });
    await chat.waitForInputReady();

    const doctor = await chat.openDoctorPanel();

    const output = doctor.getOutput();
    expect(output).toMatch(/Diagnostics/);
    expect(output).toMatch(/Versions/);
    expect(output).toMatch(/Account/);
    expect(output).toMatch(/Project/);
    expect(output).toMatch(/Features/);
    expect(output).toMatch(/Settings/);

    await doctor.dismiss();
    await chat.waitForInputReady();
  }, 60000);
});
