import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { UserPersistentStorage, HEARTBEAT_ACTIVITY_KEY } from '@gitlab-org/persistent-storage';
import { DefaultConfigService } from '@gitlab-org/config';
import {
  ExtensionActivitySnowplowTracker,
  EXTENSION_ACTIVITY_EVENT,
} from '../trackers/extension_activity_tracker';
import { DefaultDailyActivityTracker } from './daily_activity_tracker';

describe('DefaultDailyActivityTracker', () => {
  let manager: DefaultDailyActivityTracker;
  let mockTracker: ExtensionActivitySnowplowTracker;
  let mockStorage: UserPersistentStorage;
  let configService: DefaultConfigService;
  let logger: TestLogger;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(global, 'setInterval');

    mockTracker = createFakePartial<ExtensionActivitySnowplowTracker>({
      isEnabled: jest.fn().mockReturnValue(true),
      hasClientContext: jest.fn().mockReturnValue(true),
      trackEvent: jest.fn().mockResolvedValue(undefined),
    });

    mockStorage = createFakePartial<UserPersistentStorage>({
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    });

    configService = new DefaultConfigService();
    configService.set('clientInfo.name', 'jetbrains');
    configService.set('telemetry.ide', {
      name: 'IntelliJ IDEA',
      version: 'IC-241.17011.79',
      vendor: 'JetBrains',
    });

    logger = new TestLogger();

    manager = new DefaultDailyActivityTracker(mockTracker, mockStorage, logger, configService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should set up periodic checks every minute', async () => {
      await manager.initialize();

      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
    });

    it('should not reinitialize if already initialized', async () => {
      await manager.initialize();
      await manager.initialize();

      expect(setInterval).toHaveBeenCalledTimes(1);
    });
  });

  describe('activity sending logic', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should send activity when no previous timestamp exists', async () => {
      jest.mocked(mockStorage.get).mockResolvedValue(undefined);

      await jest.advanceTimersByTimeAsync(60000);

      expect(mockTracker.trackEvent).toHaveBeenCalledWith(
        EXTENSION_ACTIVITY_EVENT.ActiveInstallation,
        { timestamp: expect.any(Number) },
      );
      expect(mockStorage.set).toHaveBeenCalledWith(
        HEARTBEAT_ACTIVITY_KEY,
        expect.objectContaining({
          'IC-241.17011.79': expect.any(Number),
        }),
      );
    });

    it('should send activity when more than 24 hours have passed', async () => {
      const yesterday = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      jest.mocked(mockStorage.get).mockResolvedValue({
        'IC-241.17011.79': yesterday,
      });

      await jest.advanceTimersByTimeAsync(60000);

      expect(mockTracker.trackEvent).toHaveBeenCalled();
    });

    it('should not send activity when less than 24 hours have passed', async () => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      jest.mocked(mockStorage.get).mockResolvedValue({
        'IC-241.17011.79': oneHourAgo,
      });

      await jest.advanceTimersByTimeAsync(60000);

      expect(mockTracker.trackEvent).not.toHaveBeenCalled();
    });

    it('should not send activity when telemetry is disabled', async () => {
      jest.mocked(mockTracker.isEnabled).mockReturnValue(false);

      await jest.advanceTimersByTimeAsync(60000);

      expect(mockTracker.trackEvent).not.toHaveBeenCalled();
    });

    it('should not send activity when client context is not ready', async () => {
      jest.mocked(mockTracker.hasClientContext).mockReturnValue(false);

      await jest.advanceTimersByTimeAsync(60000);

      expect(mockTracker.trackEvent).not.toHaveBeenCalled();
      expect(mockStorage.set).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should log warning when trackEvent fails', async () => {
      jest.mocked(mockTracker.trackEvent).mockRejectedValue(new Error('Snowplow error') as never);

      await jest.advanceTimersByTimeAsync(60000);

      expect(logger.warnLogs).toContainEqual(
        expect.objectContaining({
          message: '[DailyActivityTracker] Failed to send activity event',
        }),
      );
    });

    it('should log warning when save fails after successful send', async () => {
      jest.mocked(mockStorage.set).mockRejectedValue(new Error('Storage error'));

      await jest.advanceTimersByTimeAsync(60000);

      expect(logger.warnLogs).toContainEqual(
        expect.objectContaining({
          message:
            '[DailyActivityTracker] Failed to save activity timestamp, will retry on next check',
        }),
      );
    });
  });

  describe('pending save retry mechanism', () => {
    beforeEach(async () => {
      await manager.initialize();
      jest.mocked(mockStorage.get).mockResolvedValue(undefined);
    });

    it('should store pending timestamp when save fails after successful send', async () => {
      jest.mocked(mockStorage.set).mockRejectedValueOnce(new Error('Storage error'));

      // First check - send succeeds, save fails
      await jest.advanceTimersByTimeAsync(60000);

      expect(mockTracker.trackEvent).toHaveBeenCalledTimes(1);
      expect(logger.warnLogs).toContainEqual(
        expect.objectContaining({
          message:
            '[DailyActivityTracker] Failed to save activity timestamp, will retry on next check',
        }),
      );
    });

    it('should retry saving pending timestamp on next check', async () => {
      jest
        .mocked(mockStorage.set)
        .mockRejectedValueOnce(new Error('Storage error'))
        .mockResolvedValueOnce(undefined);

      // First check - save fails, creates pending save
      await jest.advanceTimersByTimeAsync(60000);

      // Second check - should retry save
      await jest.advanceTimersByTimeAsync(60000);

      expect(mockStorage.set).toHaveBeenCalledTimes(2);
      expect(logger.infoLogs).toContainEqual(
        expect.objectContaining({
          message: '[DailyActivityTracker] Successfully saved pending activity timestamp',
        }),
      );
    });

    it('should not send new activity while pending save exists', async () => {
      jest
        .mocked(mockStorage.set)
        .mockRejectedValueOnce(new Error('Storage error'))
        .mockResolvedValueOnce(undefined);

      // First check - save fails
      await jest.advanceTimersByTimeAsync(60000);
      expect(mockTracker.trackEvent).toHaveBeenCalledTimes(1);

      // Second check - should retry save, not send new telemetry
      await jest.advanceTimersByTimeAsync(60000);
      expect(mockTracker.trackEvent).toHaveBeenCalledTimes(1); // Still 1, not 2!
    });

    it('should continue retrying if save keeps failing', async () => {
      jest.mocked(mockStorage.set).mockRejectedValue(new Error('Storage error'));

      // First check - save fails
      await jest.advanceTimersByTimeAsync(60000);

      // Multiple retry attempts
      await jest.advanceTimersByTimeAsync(60000);
      await jest.advanceTimersByTimeAsync(60000);

      expect(mockStorage.set).toHaveBeenCalledTimes(3);
      expect(mockTracker.trackEvent).toHaveBeenCalledTimes(1); // Only sent once!

      // Should have logged warning for retries
      expect(
        logger.warnLogs.filter((log) =>
          log.message?.includes('Failed to retry save activity timestamp'),
        ),
      ).toHaveLength(2);
    });

    it('should resume normal operation after pending save succeeds', async () => {
      const firstTimestamp = Date.now();
      jest
        .mocked(mockStorage.set)
        .mockRejectedValueOnce(new Error('Storage error'))
        .mockResolvedValue(undefined);

      // First check - send succeeds, save fails
      await jest.advanceTimersByTimeAsync(60000);
      expect(mockTracker.trackEvent).toHaveBeenCalledTimes(1);

      // Second check - retry save succeeds
      jest.mocked(mockStorage.get).mockResolvedValue({
        'IC-241.17011.79': firstTimestamp,
      });
      await jest.advanceTimersByTimeAsync(60000);

      expect(mockStorage.set).toHaveBeenCalledTimes(2);

      // Move system time forward 25 hours
      jest.setSystemTime(firstTimestamp + 25 * 60 * 60 * 1000);

      // Next check should send new activity since >24h passed
      await jest.advanceTimersByTimeAsync(60000);

      expect(mockTracker.trackEvent).toHaveBeenCalledTimes(2);
    });
  });

  describe('fallback to client name when IDE version missing', () => {
    beforeEach(async () => {
      configService.set('telemetry.ide', undefined);
      await manager.initialize();
    });

    it('should use client name as key when IDE version is missing', async () => {
      jest.mocked(mockStorage.get).mockResolvedValue(undefined);

      await jest.advanceTimersByTimeAsync(60000);

      expect(mockStorage.set).toHaveBeenCalledWith(
        HEARTBEAT_ACTIVITY_KEY,
        expect.objectContaining({
          jetbrains: expect.any(Number),
        }),
      );
    });

    it('should log warning when falling back to client name', async () => {
      await jest.advanceTimersByTimeAsync(60000);

      expect(logger.warnLogs).toContainEqual(
        expect.objectContaining({
          message:
            '[DailyActivityTracker] No IDE version available, cannot store activity by ide version',
        }),
      );
    });
  });

  describe('when additional context is passed to initialize', () => {
    beforeEach(async () => {
      await manager.initialize({
        terminal_name: 'iTerm2',
        os: 'darwin/23.1.0',
        is_kitty_protocol_supported: true,
        distribution: 'npm',
      });
    });

    it('should include additional context in the tracked event', async () => {
      jest.mocked(mockStorage.get).mockResolvedValue(undefined);

      await jest.advanceTimersByTimeAsync(60000);

      expect(mockTracker.trackEvent).toHaveBeenCalledWith(
        EXTENSION_ACTIVITY_EVENT.ActiveInstallation,
        expect.objectContaining({
          timestamp: expect.any(Number),
          terminal_name: 'iTerm2',
          os: 'darwin/23.1.0',
          is_kitty_protocol_supported: true,
          distribution: 'npm',
        }),
      );
    });
  });

  describe('when no additional context is passed to initialize', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should send activity with only timestamp', async () => {
      jest.mocked(mockStorage.get).mockResolvedValue(undefined);

      await jest.advanceTimersByTimeAsync(60000);

      expect(mockTracker.trackEvent).toHaveBeenCalledWith(
        EXTENSION_ACTIVITY_EVENT.ActiveInstallation,
        { timestamp: expect.any(Number) },
      );
    });
  });
});
