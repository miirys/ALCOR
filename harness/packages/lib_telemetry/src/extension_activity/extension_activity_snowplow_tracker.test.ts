import { TestLogger, Logger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DefaultConfigService } from '@gitlab-org/config';
import {
  EXTENSION_ACTIVITY_CATEGORY,
  EXTENSION_ACTIVITY_EVENT,
  ExtensionActivityContext,
} from '../trackers/extension_activity_tracker';
import { SnowplowService } from '../snowplow/snowplow_service';
import { StandardContext } from '../snowplow/standard_context';
import { DefaultExtensionActivitySnowplowTracker } from './extension_activity_snowplow_tracker';

describe('DefaultExtensionActivitySnowplowTracker', () => {
  let tracker: DefaultExtensionActivitySnowplowTracker;
  let configService: DefaultConfigService;
  let mockSnowplowService: SnowplowService;
  let logger: Logger;
  let mockStandardContext: StandardContext;

  beforeEach(() => {
    configService = new DefaultConfigService();
    mockSnowplowService = createFakePartial<SnowplowService>({
      trackStructuredEvent: jest.fn().mockResolvedValue(undefined),
      validateContext: jest.fn().mockReturnValue(true),
    });

    mockStandardContext = createFakePartial<StandardContext>({
      build: jest.fn().mockReturnValue({
        schema: 'iglu:com.gitlab/gitlab_standard/jsonschema/1-1-1',
        data: { source: 'test' },
      }),
    });

    logger = new TestLogger();

    tracker = new DefaultExtensionActivitySnowplowTracker(
      configService,
      mockSnowplowService,
      mockStandardContext,
      logger,
    );
  });

  describe('isEnabled', () => {
    it('should return true by default', () => {
      expect(tracker.isEnabled()).toBe(true);
    });

    it('should return false when telemetry is disabled', () => {
      configService.set('telemetry.enabled', false);
      expect(tracker.isEnabled()).toBe(false);
    });

    it('should return true when telemetry is enabled', () => {
      configService.set('telemetry.enabled', false);
      configService.set('telemetry.enabled', true);
      expect(tracker.isEnabled()).toBe(true);
    });
  });

  describe('hasClientContext', () => {
    it('should return false when no IDE or extension info is set', () => {
      expect(tracker.hasClientContext()).toBe(false);
    });

    it('should return true when IDE name is set', () => {
      configService.set('telemetry.ide', {
        name: 'IntelliJ IDEA',
        version: 'IC-241.17011.79',
        vendor: 'JetBrains',
      });

      expect(tracker.hasClientContext()).toBe(true);
    });

    it('should return true when extension name is set', () => {
      configService.set('telemetry.extension', {
        name: 'GitLab Duo',
        version: '3.24.0',
      });

      expect(tracker.hasClientContext()).toBe(true);
    });
  });

  describe('trackEvent', () => {
    const event = EXTENSION_ACTIVITY_EVENT.ActiveInstallation;
    const mockContext: ExtensionActivityContext = { timestamp: Date.now() };

    beforeEach(() => {
      configService.set('telemetry.ide', {
        name: 'IntelliJ IDEA',
        version: 'IC-241.17011.79',
        vendor: 'JetBrains',
      });
      configService.set('telemetry.extension', {
        name: 'GitLab Duo',
        version: '3.24.0',
      });
    });

    it('should not track when telemetry is disabled', async () => {
      configService.set('telemetry.enabled', false);

      await tracker.trackEvent(event, mockContext);

      expect(mockSnowplowService.trackStructuredEvent).not.toHaveBeenCalled();
    });

    it('should not track when client context is not ready', async () => {
      configService.set('telemetry.ide', undefined);
      configService.set('telemetry.extension', undefined);

      await tracker.trackEvent(event, mockContext);

      expect(mockSnowplowService.trackStructuredEvent).not.toHaveBeenCalled();
    });

    it('should track event successfully with valid contexts', async () => {
      await tracker.trackEvent(event, mockContext);

      expect(mockSnowplowService.trackStructuredEvent).toHaveBeenCalledWith(
        {
          category: EXTENSION_ACTIVITY_CATEGORY,
          action: event,
        },
        expect.arrayContaining([
          expect.objectContaining({
            schema: 'iglu:com.gitlab/gitlab_standard/jsonschema/1-1-1',
          }),
          expect.objectContaining({
            schema: 'iglu:com.gitlab/ide_extension_version/jsonschema/1-1-0',
            data: expect.objectContaining({
              ide_name: 'IntelliJ IDEA',
              ide_vendor: 'JetBrains',
              ide_version: 'IC-241.17011.79',
              extension_name: 'GitLab Duo',
              extension_version: '3.24.0',
            }),
          }),
        ]),
      );
    });

    it('should build standard context with timestamp when provided', async () => {
      const timestamp = 1234567890;
      await tracker.trackEvent(event, { timestamp });

      expect(mockStandardContext.build).toHaveBeenCalledWith({
        timestamp: '1234567890',
      });
    });

    it('should build standard context without timestamp when not provided', async () => {
      await tracker.trackEvent(event);

      expect(mockStandardContext.build).toHaveBeenCalledWith({});
    });

    it('should pass additional context fields to standard context extra', async () => {
      const contextWithEnv: ExtensionActivityContext = {
        timestamp: 1234567890,
        terminal_name: 'iTerm2',
        os: 'darwin/23.1.0',
        is_kitty_protocol_supported: true,
        distribution: 'npm',
      };

      await tracker.trackEvent(event, contextWithEnv);

      expect(mockStandardContext.build).toHaveBeenCalledWith({
        timestamp: '1234567890',
        terminal_name: 'iTerm2',
        os: 'darwin/23.1.0',
        is_kitty_protocol_supported: 'true',
        distribution: 'npm',
      });
    });
  });

  describe('configuration changes', () => {
    it('should update enabled state when telemetry config changes', () => {
      expect(tracker.isEnabled()).toBe(true);

      configService.set('telemetry.enabled', false);
      expect(tracker.isEnabled()).toBe(false);

      configService.set('telemetry.enabled', true);
      expect(tracker.isEnabled()).toBe(true);
    });

    it('should update client context when IDE info changes', () => {
      configService.set('telemetry.ide', {
        name: 'VS Code',
        version: '1.85.0',
        vendor: 'Microsoft',
      });

      expect(tracker.hasClientContext()).toBe(true);
    });

    it('should update client context when extension info changes', () => {
      configService.set('telemetry.extension', {
        name: 'GitLab Workflow',
        version: '4.10.0',
      });

      expect(tracker.hasClientContext()).toBe(true);
    });

    it('should handle null telemetry config gracefully', () => {
      configService.set('telemetry', undefined);

      expect(tracker.hasClientContext()).toBe(false);
      expect(tracker.isEnabled()).toBe(true); // Default stays true
    });
  });
});
