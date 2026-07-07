import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { UserPersistentStorage, HEARTBEAT_ACTIVITY_KEY } from '@gitlab-org/persistent-storage';
import { ConfigService } from '@gitlab-org/config';
import {
  ExtensionActivitySnowplowTracker,
  EXTENSION_ACTIVITY_EVENT,
} from '../trackers/extension_activity_tracker';

const ACTIVITY_CHECK_INTERVAL_MS = 60 * 1000; // 1 minute
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DailyActivityTracker {
  initialize(context?: Record<string, unknown>): Promise<void>;
}

export const DailyActivityTracker = createInterfaceId<DailyActivityTracker>('DailyActivityTracker');

@Injectable(DailyActivityTracker, [
  ExtensionActivitySnowplowTracker,
  UserPersistentStorage,
  Logger,
  ConfigService,
])
export class DefaultDailyActivityTracker implements DailyActivityTracker {
  #tracker: ExtensionActivitySnowplowTracker;

  #storage: UserPersistentStorage;

  #logger: Logger;

  #isInitialized: boolean = false;

  #pendingSaveTimestamp?: number;

  #lastActivity: number | null | undefined;

  #configService: ConfigService;

  #additionalContext: Record<string, unknown> = {};

  constructor(
    tracker: ExtensionActivitySnowplowTracker,
    storage: UserPersistentStorage,
    logger: Logger,
    configService: ConfigService,
  ) {
    this.#tracker = tracker;
    this.#storage = storage;
    this.#logger = withPrefix(logger, '[DailyActivityTracker]');
    this.#configService = configService;
  }

  async initialize(context?: Record<string, unknown>): Promise<void> {
    if (this.#isInitialized) {
      return;
    }

    if (context) {
      this.#additionalContext = context;
    }

    // Set up periodic checks (every minute)
    // Interval runs for the lifetime of the language server process
    setInterval(() => {
      this.#checkAndSendActivity().catch((error) => {
        this.#logger.warn('Error during activity check', error);
      });
    }, ACTIVITY_CHECK_INTERVAL_MS);

    this.#isInitialized = true;
  }

  async #checkAndSendActivity(): Promise<void> {
    if (!this.#tracker.isEnabled()) {
      return;
    }

    // First, retry saving any pending timestamp from a previous failed save
    if (this.#pendingSaveTimestamp) {
      await this.#retrySavePendingTimestamp();
      return; // Skip sending new activity event until pending save succeeds
    }

    if (this.#lastActivity === undefined) {
      this.#lastActivity = await this.#getLastActivityTimestamp();
    }

    const now = Date.now();
    if (this.#shouldSendActivity(now, this.#lastActivity)) {
      await this.#sendActivity(now);
    }
  }

  #shouldSendActivity(now: number, lastActivity: number | null): boolean {
    if (lastActivity === null) {
      return true;
    }

    const timeSinceLastActivity = now - lastActivity;
    return timeSinceLastActivity >= MS_PER_DAY;
  }

  async #sendActivity(timestamp: number): Promise<void> {
    try {
      // Skip if client context not ready
      if (!this.#tracker.hasClientContext()) {
        return;
      }

      await this.#tracker.trackEvent(EXTENSION_ACTIVITY_EVENT.ActiveInstallation, {
        timestamp,
        ...this.#additionalContext,
      });

      // Try to save timestamp after successful send
      try {
        await this.#saveLastActivityTimestamp(timestamp);
        this.#pendingSaveTimestamp = undefined; // Clear any pending save
      } catch (saveError) {
        // Save failed but telemetry was sent - store timestamp for retry
        // This prevents sending duplicate telemetry events on next check
        this.#pendingSaveTimestamp = timestamp;
        this.#logger.warn('Failed to save activity timestamp, will retry on next check', saveError);
      }
    } catch (error) {
      this.#logger.warn('Failed to send activity event', error);
    }
  }

  async #retrySavePendingTimestamp(): Promise<void> {
    if (!this.#pendingSaveTimestamp) {
      return;
    }

    try {
      await this.#saveLastActivityTimestamp(this.#pendingSaveTimestamp);
      this.#logger.info('Successfully saved pending activity timestamp');
      this.#pendingSaveTimestamp = undefined; // Clear flag on success
    } catch (error) {
      this.#logger.warn('Failed to retry save activity timestamp, will retry on next check', error);
      // Keep #pendingSaveTimestamp set for another retry
    }
  }

  async #getLastActivityTimestamp(): Promise<number | null> {
    try {
      const activities = (await this.#storage.get(HEARTBEAT_ACTIVITY_KEY)) || {};
      const value = activities[this.#getActivityKey() || ''];

      return typeof value === 'number' ? value : null;
    } catch (error) {
      this.#logger.warn('Failed to get last activity timestamp', error);
      return null;
    }
  }

  async #saveLastActivityTimestamp(timestamp: number): Promise<void> {
    const activityRecord = (await this.#storage.get(HEARTBEAT_ACTIVITY_KEY)) || {};
    const activityKey = this.#getActivityKey();

    if (!activityKey) {
      this.#logger.warn('No activity key available, cannot save activity timestamp');
      return;
    }

    if (!this.#configService.get('telemetry')?.ide?.version) {
      this.#logger.warn('No IDE version available, cannot store activity by ide version');
    }

    activityRecord[activityKey] = timestamp;

    await this.#storage.set(HEARTBEAT_ACTIVITY_KEY, activityRecord);
    this.#lastActivity = timestamp;
  }

  #getActivityKey() {
    const version = this.#configService.get('telemetry')?.ide?.version;
    const clientName = this.#configService.get('clientInfo.name');

    return version || clientName;
  }
}
