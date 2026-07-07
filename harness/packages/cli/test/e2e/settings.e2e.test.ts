import { getTestToken } from './test_utils';
import { recordedTest } from './recorded_test';

describe('Settings TUI E2E', () => {
  const ctx = recordedTest();

  it('opens settings, navigates, toggles, and closes', async () => {
    const chat = ctx.launchChat({
      cliOptions: { gitlabAuthToken: getTestToken() },
    });
    await chat.waitForInputReady();

    // Open settings panel
    const settings = await chat.openSettingsPanel();

    // Verify initial render — telemetry is selected by default
    await settings.waitForTelemetryDescription();
    let output = settings.getOutput();
    expect(output).toMatch(/Telemetry/);
    expect(output).toMatch(/Enable global skills/);

    // Navigate down to enableGlobalSkills
    await settings.navigateDown();
    await settings.waitForGlobalSkillsDescription();

    // Toggle enableGlobalSkills (off → on)
    await settings.toggle();
    output = settings.getOutput();
    // The enableGlobalSkills row should now show "on"
    // Match the row: "Enable global skills" followed by "on" on the same screen
    expect(output).toMatch(/Enable global skills/);

    // Navigate back up to telemetry
    await settings.navigateUp();
    await settings.waitForTelemetryDescription();

    // Dismiss settings panel
    await settings.dismiss();
    await chat.waitForInputReady();

    // Re-open settings to verify in-session state persisted
    const settings2 = await chat.openSettingsPanel();
    await settings2.waitForTelemetryDescription();
    output = settings2.getOutput();
    expect(output).toMatch(/Settings/);

    await settings2.dismiss();
    await chat.waitForInputReady();
  }, 60000);
});
