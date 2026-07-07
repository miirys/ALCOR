import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { UserPersistentStorage } from '@gitlab-org/persistent-storage';
import { CLI_INPUT_TYPES, SettingsInput, type AppState } from '@gitlab-org/tui';
import type { ControllerApi } from '../../commands/tui/controller_api';
import { SlashCommandAction } from '../slash_command_handler';
import { DefaultSettingsCommandHandler } from './settings_command_handler';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

describe('SettingsCommandHandler', () => {
  let handler: DefaultSettingsCommandHandler;
  let mockApi: ControllerApi;
  let mockConfigService: ConfigService;
  let mockUserPersistentStorage: UserPersistentStorage;
  let mockLogger: TestLogger;
  let capturedMutation: ((state: AppState) => AppState) | undefined;

  beforeEach(() => {
    capturedMutation = undefined;

    mockApi = createFakePartial<ControllerApi>({
      showInfo: jest.fn<ControllerApi['showInfo']>(),
      ensureInitialized: jest.fn<ControllerApi['ensureInitialized']>().mockResolvedValue(undefined),
      mutateState: jest.fn<ControllerApi['mutateState']>().mockImplementation((mutation) => {
        capturedMutation = mutation;
        return {} as AppState;
      }),
    });

    mockConfigService = createFakePartial<ConfigService>({
      get: jest.fn() as unknown as ConfigService['get'],
      set: jest.fn(),
    });

    mockUserPersistentStorage = createFakePartial<UserPersistentStorage>({
      set: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });

    mockLogger = new TestLogger();

    handler = new DefaultSettingsCommandHandler(
      mockConfigService,
      mockUserPersistentStorage,
      mockLogger,
    );
  });

  describe('command metadata', () => {
    it('has the correct name', () => {
      expect(handler.command.name).toBe('/settings');
    });

    it('has the correct action', () => {
      expect(handler.command.action).toBe(SlashCommandAction.Settings);
    });

    it('has a description', () => {
      expect(handler.command.description).toBeTruthy();
    });
  });

  describe('execute', () => {
    it('calls ensureInitialized before opening settings', async () => {
      jest.mocked(mockConfigService.get).mockReturnValue({ enabled: true } as never);

      await handler.execute(mockApi);

      expect(mockApi.ensureInitialized).toHaveBeenCalledTimes(1);
    });

    it('opens the settings TUI via mutateState', async () => {
      jest.mocked(mockConfigService.get).mockReturnValue({ enabled: true } as never);

      await handler.execute(mockApi);

      expect(mockApi.mutateState).toHaveBeenCalled();
    });

    it('sets input type to SETTINGS', async () => {
      jest.mocked(mockConfigService.get).mockReturnValue({ enabled: true } as never);

      await handler.execute(mockApi);

      const state = capturedMutation!({ input: { inputType: 'text' } } as AppState);
      expect(state.input.inputType).toBe(CLI_INPUT_TYPES.SETTINGS);
    });

    it('includes telemetry, enableGlobalSkills and notifications items', async () => {
      (jest.mocked(mockConfigService.get) as unknown as jest.Mock<AnyFn>).mockImplementation(
        (key: string) => {
          if (key === 'telemetry') return { enabled: true };
          if (key === 'enableGlobalSkills') return false;
          if (key === 'notifications') return { channel: 'auto' };
          return undefined;
        },
      );

      await handler.execute(mockApi);

      const state = capturedMutation!({ input: { inputType: 'text' } } as AppState);
      if (state.input.inputType === CLI_INPUT_TYPES.SETTINGS) {
        expect(state.input.items).toHaveLength(3);
        expect(state.input.items[0].key).toBe('telemetry');
        expect(state.input.items[0].enabled).toBe(true);
        expect(state.input.items[1].key).toBe('enableGlobalSkills');
        expect(state.input.items[1].enabled).toBe(false);
        expect(state.input.items[2].key).toBe('notifications');
        expect(state.input.items[2].options).toEqual([
          { value: 'auto', label: 'auto' },
          { value: 'disabled', label: 'disabled' },
        ]);
        expect(state.input.items[2].value).toBe('auto');
      }
    });
  });

  describe('onSelect (notifications)', () => {
    it('sets the channel in config and persists it', async () => {
      (jest.mocked(mockConfigService.get) as unknown as jest.Mock<AnyFn>).mockReturnValue({
        channel: 'auto',
      });

      const entry = handler.getComponent(mockApi);
      entry.callbacks.onSelect!('notifications', 'disabled');

      expect(mockConfigService.set).toHaveBeenCalledWith('notifications', { channel: 'disabled' });
      await new Promise(process.nextTick);
      expect(mockUserPersistentStorage.set).toHaveBeenCalledWith('notifications', {
        channel: 'disabled',
      });
      expect(mockApi.mutateState).toHaveBeenCalled();
    });

    it('falls back to auto for an unexpected value', () => {
      const entry = handler.getComponent(mockApi);
      entry.callbacks.onSelect!('notifications', 'whatever');

      expect(mockConfigService.set).toHaveBeenCalledWith('notifications', { channel: 'auto' });
    });

    it('ignores onSelect for non-notification keys', () => {
      const entry = handler.getComponent(mockApi);
      entry.callbacks.onSelect!('telemetry', 'disabled');

      expect(mockConfigService.set).not.toHaveBeenCalled();
    });
  });

  describe('getComponent', () => {
    it('returns SettingsInput component', () => {
      const entry = handler.getComponent(mockApi);
      expect(entry.component).toBe(SettingsInput);
    });

    it('returns SETTINGS inputType', () => {
      const entry = handler.getComponent(mockApi);
      expect(entry.inputType).toBe(CLI_INPUT_TYPES.SETTINGS);
    });

    it('returns callbacks with onToggle and onClose', () => {
      const entry = handler.getComponent(mockApi);
      expect(entry.callbacks.onToggle).toBeDefined();
      expect(entry.callbacks.onClose).toBeDefined();
    });
  });

  describe('onToggle', () => {
    it('toggles telemetry from enabled to disabled', async () => {
      (jest.mocked(mockConfigService.get) as unknown as jest.Mock<AnyFn>).mockImplementation(
        (key: string) => (key === 'telemetry' ? { enabled: true } : false),
      );

      const entry = handler.getComponent(mockApi);
      entry.callbacks.onToggle('telemetry');

      expect(mockConfigService.set).toHaveBeenCalledWith('telemetry.enabled', false);
      // Wait for async persistence
      await new Promise(process.nextTick);
      expect(mockUserPersistentStorage.set).toHaveBeenCalledWith('telemetry', { enabled: false });
    });

    it('toggles telemetry from disabled to enabled', async () => {
      (jest.mocked(mockConfigService.get) as unknown as jest.Mock<AnyFn>).mockImplementation(
        (key: string) => (key === 'telemetry' ? { enabled: false } : false),
      );

      const entry = handler.getComponent(mockApi);
      entry.callbacks.onToggle('telemetry');

      expect(mockConfigService.set).toHaveBeenCalledWith('telemetry.enabled', true);
      await new Promise(process.nextTick);
      expect(mockUserPersistentStorage.set).toHaveBeenCalledWith('telemetry', { enabled: true });
    });

    it('toggles enableGlobalSkills from disabled to enabled', async () => {
      (jest.mocked(mockConfigService.get) as unknown as jest.Mock<AnyFn>).mockImplementation(
        (key: string) => {
          if (key === 'telemetry') return { enabled: true };
          if (key === 'enableGlobalSkills') return false;
          return undefined;
        },
      );

      const entry = handler.getComponent(mockApi);
      entry.callbacks.onToggle('enableGlobalSkills');

      expect(mockConfigService.set).toHaveBeenCalledWith('enableGlobalSkills', true);
      await new Promise(process.nextTick);
      expect(mockUserPersistentStorage.set).toHaveBeenCalledWith('enableGlobalSkills', {
        enabled: true,
      });
    });

    it('updates TUI state after toggling', () => {
      (jest.mocked(mockConfigService.get) as unknown as jest.Mock<AnyFn>).mockImplementation(
        (key: string) => (key === 'telemetry' ? { enabled: true } : false),
      );

      const entry = handler.getComponent(mockApi);
      entry.callbacks.onToggle('telemetry');

      expect(mockApi.mutateState).toHaveBeenCalled();
    });

    it('logs error but does not throw when persistence fails', async () => {
      (jest.mocked(mockConfigService.get) as unknown as jest.Mock<AnyFn>).mockImplementation(
        (key: string) => (key === 'telemetry' ? { enabled: true } : false),
      );
      jest
        .mocked(mockUserPersistentStorage.set)
        .mockRejectedValue(new Error('Storage unavailable'));

      const entry = handler.getComponent(mockApi);
      entry.callbacks.onToggle('telemetry');

      // Should not throw
      expect(mockConfigService.set).toHaveBeenCalledWith('telemetry.enabled', false);
    });
  });

  describe('onClose', () => {
    it('resets input to default text state', () => {
      const entry = handler.getComponent(mockApi);
      entry.callbacks.onClose();

      expect(mockApi.mutateState).toHaveBeenCalled();
      const state = capturedMutation!({
        input: { inputType: CLI_INPUT_TYPES.SETTINGS },
      } as AppState);
      expect(state.input.inputType).toBe('text');
    });
  });
});
