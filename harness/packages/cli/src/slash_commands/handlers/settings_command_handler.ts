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
  type AppState,
  type SettingsCallbacks,
  type SettingsItem,
  type SettingsStats,
  type SettingsToggleItem,
  type SettingsSelectorItem,
} from '@gitlab-org/tui';
import type { ControllerApi } from '../../commands/tui/controller_api';
import {
  SlashCommandHandler,
  SlashCommandAction,
  type SlashCommand,
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

  command: SlashCommand = {
    name: '/settings',
    description: 'Open settings · themes, behavior, stats, keys',
    action: SlashCommandAction.Settings,
  };

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
    this.openSettings(api, 'Appearance');
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

  protected openSettings(
    api: ControllerApi,
    initialTab: 'Appearance' | 'Behavior' | 'Stats' | 'MCP' | 'Keys',
  ): void {
    this.#logger.info('Opening settings');

    api.mutateState((state) => ({
      ...state,
      input: {
        inputType: CLI_INPUT_TYPES.SETTINGS,
        items: this.#buildSettingsItems(),
        selectedIndex: 0,
        initialTab,
        stats: buildSettingsStats(state),
        mcpServers: state.mcpServers,
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

/** Live session facts for the settings Stats tab, computed from TUI state. */
function buildSettingsStats(state: AppState): SettingsStats {
  const counts = new Map<string, number>();
  let turns = 0;
  for (const el of state.elements) {
    if (el.type === 'message' && el.role === 'user') turns += 1;
    if (el.type === 'tool') {
      const name = el.input.tool === 'generic' ? el.input.name : el.input.tool;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return {
    turns,
    toolCounts: [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    tokensUsed: state.contextUsage?.totalTokens,
    tokensMax: state.contextUsage?.maxTokens,
    model: state.selectedModel,
  };
}

/** `/theme` — the settings panel opened on the Appearance tab. */
@Injectable(SlashCommandHandler, [ConfigService, UserPersistentStorage, Logger])
export class DefaultThemeCommandHandler extends DefaultSettingsCommandHandler {
  override command: SlashCommand = {
    name: '/theme',
    description: 'Switch the color theme',
    action: 'theme',
  };

  override async execute(api: ControllerApi): Promise<void> {
    await api.ensureInitialized();
    this.openSettings(api, 'Appearance');
  }
}

/** `/stats` — the settings panel opened on the Stats tab. */
@Injectable(SlashCommandHandler, [ConfigService, UserPersistentStorage, Logger])
export class DefaultStatsCommandHandler extends DefaultSettingsCommandHandler {
  override command: SlashCommand = {
    name: '/stats',
    description: 'Session stats: turns, tokens, tool usage',
    action: 'stats',
  };

  override async execute(api: ControllerApi): Promise<void> {
    await api.ensureInitialized();
    this.openSettings(api, 'Stats');
  }
}
