import { Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import type { Disposable } from '@gitlab-org/disposable';
import { DesktopNotifier } from './desktop_notifier';
import { resolveNotificationTarget } from './notification_target';

/** The kinds of session events that can raise a notification. */
export type NotificationEvent = 'approval' | 'response_ready' | 'error';

export interface NotifyContext {
  /** Whether the terminal is currently focused. */
  focused: boolean;
}

const MESSAGES: Record<NotificationEvent, { title: string; body: string }> = {
  approval: { title: 'ALCOR', body: 'Approval needed to continue' },
  response_ready: { title: 'ALCOR', body: 'Response ready' },
  error: { title: 'ALCOR', body: 'The session stopped with an error' },
};

/**
 * Raises a system notification when a session needs the user's attention while they're
 * multitasking. Honours the `notifications.channel` config (`auto` | `disabled`), suppresses
 * while the terminal is focused, and delegates delivery to the terminal-appropriate mechanism
 * resolved by `resolveNotificationTarget` (which also disables notifications under tmux/screen).
 */
@Service({ dependencies: [Logger, ConfigService], lifetime: ServiceLifetime.Singleton })
export class NotificationService implements Disposable {
  #logger: Logger;

  #configService: ConfigService;

  #desktopNotifier: DesktopNotifier;

  constructor(logger: Logger, configService: ConfigService, desktopNotifier?: DesktopNotifier) {
    this.#logger = withPrefix(logger, '[NotificationService]');
    this.#configService = configService;
    this.#desktopNotifier = desktopNotifier ?? new DesktopNotifier(logger);
  }

  notify(event: NotificationEvent, ctx: NotifyContext): void {
    const channel = this.#configService.get('notifications')?.channel ?? 'auto';
    if (channel === 'disabled') {
      return;
    }

    if (ctx.focused) {
      this.#logger.debug(`Suppressing "${event}" notification: terminal is focused`);
      return;
    }

    const target = resolveNotificationTarget();
    if (target.kind === 'none') {
      this.#logger.debug(`Suppressing "${event}" notification: no delivery target`);
      return;
    }

    this.#desktopNotifier.notify(target, MESSAGES[event]);
  }

  dispose(): void {
    this.#desktopNotifier.dispose();
  }
}
