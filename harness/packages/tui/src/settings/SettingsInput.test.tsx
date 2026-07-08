import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { SettingsInputState } from '../types';
import { CLI_INPUT_TYPES } from '../constants';
import { renderWithProviders } from '../test/render_helper';
import type { SettingsCallbacks } from './SettingsInput';
import { SettingsInput } from './SettingsInput';

const createInputState = (overrides: Partial<SettingsInputState> = {}): SettingsInputState => ({
  inputType: CLI_INPUT_TYPES.SETTINGS,
  items: [
    {
      key: 'telemetry',
      label: 'Telemetry',
      description: 'Send anonymous usage data to improve GitLab Duo',
      enabled: true,
    },
    {
      key: 'enableGlobalSkills',
      label: 'Enable global skills',
      description: 'Discover global agent skills from ~/.agents/skills/ (restart required)',
      enabled: false,
    },
  ],
  selectedIndex: 0,
  initialTab: 'Behavior',
  ...overrides,
});

const renderSettings = (input: SettingsInputState, callbacks: SettingsCallbacks) => {
  return renderWithProviders(<SettingsInput input={input} callbacks={callbacks} />);
};

describe('SettingsInput', () => {
  let callbacks: SettingsCallbacks;

  beforeEach(() => {
    callbacks = createFakePartial<SettingsCallbacks>({
      onToggle: jest.fn(),
      onClose: jest.fn(),
    });
  });

  describe('rendering', () => {
    it('renders the Settings title', () => {
      const { lastFrame } = renderSettings(createInputState(), callbacks);
      expect(lastFrame()).toContain('Settings');
    });

    it('renders all setting labels', () => {
      const { lastFrame } = renderSettings(createInputState(), callbacks);
      const output = lastFrame();
      expect(output).toContain('Telemetry');
      expect(output).toContain('Enable global skills');
    });

    it('renders on/off status for each setting', () => {
      const { lastFrame } = renderSettings(createInputState(), callbacks);
      const output = lastFrame();
      expect(output).toContain('on');
      expect(output).toContain('off');
    });

    it('renders the description of the selected item', () => {
      const { lastFrame } = renderSettings(createInputState(), callbacks);
      expect(lastFrame()).toContain('Send anonymous usage data to improve GitLab Duo');
    });

    it('renders the arrow cursor on the first item by default', () => {
      const { lastFrame } = renderSettings(createInputState(), callbacks);
      expect(lastFrame()).toContain('▌');
    });
  });

  describe('keyboard handling', () => {
    it('calls onClose when Escape is pressed', () => {
      const { sendInput } = renderSettings(createInputState(), callbacks);
      sendInput('', { escape: true });
      expect(callbacks.onClose).toHaveBeenCalled();
    });

    it('calls onToggle with the selected item key when Enter is pressed', () => {
      const { sendInput } = renderSettings(createInputState(), callbacks);
      sendInput('', { return: true });
      expect(callbacks.onToggle).toHaveBeenCalledWith('telemetry');
    });

    it('navigates down and toggles the second item', () => {
      const { sendInput, rerender } = renderSettings(createInputState(), callbacks);
      const input = createInputState();

      sendInput('', { downArrow: true });
      rerender(<SettingsInput input={input} callbacks={callbacks} />);

      sendInput('', { return: true });
      expect(callbacks.onToggle).toHaveBeenCalledWith('enableGlobalSkills');
    });

    it('does not navigate above the first item', () => {
      const { sendInput, lastFrame } = renderSettings(createInputState(), callbacks);
      sendInput('', { upArrow: true });
      // Still on first item — description unchanged
      expect(lastFrame()).toContain('Send anonymous usage data');
    });

    it('does not navigate below the last item', () => {
      const input = createInputState({ selectedIndex: 0 });
      const { sendInput, rerender } = renderSettings(input, callbacks);
      sendInput('', { downArrow: true });
      rerender(<SettingsInput input={input} callbacks={callbacks} />);
      sendInput('', { downArrow: true }); // try to go past the end
      rerender(<SettingsInput input={input} callbacks={callbacks} />);
      // Should have toggled nothing extra
      sendInput('', { return: true });
      expect(callbacks.onToggle).toHaveBeenCalledWith('enableGlobalSkills');
    });
  });
});
