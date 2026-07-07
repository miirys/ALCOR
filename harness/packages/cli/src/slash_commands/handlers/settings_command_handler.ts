import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService, type NotificationChannel } from '@gitlab-org/config';
import { doNotAwait } from '@gitlab-org/core';
import { UserPersistentStorage } from '@gitlab-org/persistent-storage';
import {
  CLI_INPUT_TYPES,
  defaultInputState,
  SettingsInput,
  settingsFooterHint,
  type SettingsCallbacks,
  type SettingsItem,
  type SettingsToggleItem,
  type SettingsSelectorItem,
} from '@gitlab-org/tui';
import type { ControllerApi } from '../../commands/tui/controller_api';
import {
  SlashCommandHandler,
  SlashCommandAction,
  type CommandComponentEntry,
} from '../slash_command_handler';

const NOTIFICATIONS_KEY = 'notifications';
const DEFAULT_NOTIFICATION_CHANNEL: NotificationChannel = 'auto';

// The static shape of each setting; the dynamic field (a toggle's `enabled` or a
// selector's `value`) is filled in at build time by #buildSettingsItems.
type SettingsDefinition = Omit<SettingsToggleItem, 'enabled'> | Omit<SettingsSelectorItem, 'value'>;

const SETTINGS_DEFINITIONS: SettingsDefinition[] = [
  {
    key: 'telemetry',
    label: 'Telemetry',
    description: 'Send anonymous usage data to improve GitLab Duo',
  },
  {
    key: 'enableGlobalSkills',
    label: 'Enable global skills',
    description:
      'Discover global agent skills from ~/.agents/skills/ and ~/.gitlab/duo/skills/ (restart required)',
  },
  {
    key: NOTIFICATIONS_KEY,
    label: 'Notifications',
    description:
      'System notifications when a session needs attention while the terminal is unfocused',
    options: [
      { value: 'auto', label: 'auto' },
      { value: 'disabled', label: 'disabled' },
    ],
  },
];

@Injectable(SlashCommandHandler, [ConfigService, UserPersistentStorage, Logger])
export class DefaultSettingsCommandHandler implements SlashCommandHandler<SettingsCallbacks> {
  #configService: ConfigService;

  #userPersistentStorage: UserPersistentStorage;

  #logger: Logger;

  command = {
    name: '/settings',
    description: 'Open settings',
    action: SlashCommandAction.Settings,
  } as const;

  constructor(
    configService: ConfigService,
    userPersistentStorage: UserPersistentStorage,
    logger: Logger,
  ) {
    this.#configService = configService;
    this.#userPersistentStorage = userPersistentStorage;
    this.#logger = withPrefix(logger, '[SettingsCommandHandler]');
  }

  async execute(api: ControllerApi): Promise<void> {
    await api.ensureInitialized();
    this.#openSettings(api);
  }

  getComponent(api: ControllerApi): CommandComponentEntry<SettingsCallbacks> {
    return {
      inputType: CLI_INPUT_TYPES.SETTINGS,
      component: SettingsInput,
      footerHint: settingsFooterHint,
      callbacks: {
        onToggle: (key: string) => this.#handleToggle(api, key),
        onSelect: (key: string, value: string) => this.#handleSelect(api, key, value),
        onClose: () => this.#closeSettings(api),
      },
    };
  }

  #openSettings(api: ControllerApi): void {
    this.#logger.info('Opening settings');

    api.mutateState((state) => ({
      ...state,
      input: {
        inputType: CLI_INPUT_TYPES.SETTINGS,
        items: this.#buildSettingsItems(),
        selectedIndex: 0,
      },
    }));
  }

  #closeSettings(api: ControllerApi): void {
    this.#logger.info('Closing settings');
    api.mutateState((state) => ({ ...state, input: defaultInputState }));
  }

  #handleToggle(api: ControllerApi, key: string): void {
    const item = SETTINGS_DEFINITIONS.find((d) => d.key === key);
    if (!item) return;

    const newValue = !this.#getCurrentValue(key);

    // Update ConfigService immediately
    this.#setConfigValue(key, newValue);

    // Persist asynchronously
    doNotAwait(this.#persistSetting(key, newValue));

    // Update TUI state
    this.#refreshSettingsItems(api);
  }

  #handleSelect(api: ControllerApi, key: string, value: string): void {
    if (key !== NOTIFICATIONS_KEY) return;

    const channel: NotificationChannel = value === 'disabled' ? 'disabled' : 'auto';
    this.#configService.set('notifications', { channel });
    doNotAwait(this.#persistNotifications(channel));

    this.#refreshSettingsItems(api);
  }

  /**
   * Re-renders the settings list in place after a toggle/select, preserving the current
   * selection. No-op if the user has navigated away from the settings input in the meantime.
   */
  #refreshSettingsItems(api: ControllerApi): void {
    api.mutateState((state) => {
      if (state.input.inputType !== CLI_INPUT_TYPES.SETTINGS) return state;
      return {
        ...state,
        input: {
          ...state.input,
          items: this.#buildSettingsItems(),
        },
      };
    });
  }

  #buildSettingsItems(): SettingsItem[] {
    return SETTINGS_DEFINITIONS.map((def): SettingsItem => {
      if (def.options) {
        // notifications is currently the only selector-style setting
        return { ...def, value: this.#getNotificationChannel() };
      }
      return { ...def, enabled: this.#getCurrentValue(def.key) };
    });
  }

  #getNotificationChannel(): NotificationChannel {
    return this.#configService.get('notifications')?.channel ?? DEFAULT_NOTIFICATION_CHANNEL;
  }

  async #persistNotifications(channel: NotificationChannel): Promise<void> {
    try {
      await this.#userPersistentStorage.set('notifications', { channel });
    } catch (error) {
      this.#logger.error('Failed to persist notifications setting', error);
    }
  }

  #getCurrentValue(key: string): boolean {
    if (key === 'telemetry') {
      return this.#configService.get('telemetry')?.enabled ?? true;
    }
    if (key === 'enableGlobalSkills') {
      return this.#configService.get('enableGlobalSkills') ?? false;
    }
    return false;
  }

  #setConfigValue(key: string, value: boolean): void {
    if (key === 'telemetry') {
      this.#configService.set('telemetry.enabled', value);
    } else if (key === 'enableGlobalSkills') {
      this.#configService.set('enableGlobalSkills', value);
    }
  }

  async #persistSetting(key: string, value: boolean): Promise<void> {
    try {
      if (key === 'telemetry') {
        await this.#userPersistentStorage.set('telemetry', { enabled: value });
      } else if (key === 'enableGlobalSkills') {
        await this.#userPersistentStorage.set('enableGlobalSkills', { enabled: value });
      }
    } catch (error) {
      this.#logger.error(`Failed to persist ${key} setting`, error);
    }
  }
}
