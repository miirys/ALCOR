import { TestLogger, Logger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DefaultConfigService } from '@gitlab-org/config';
import { SnowplowService } from '../snowplow/snowplow_service';
import { StandardContext } from '../snowplow/standard_context';
import {
  DUO_AGENT_PLATFORM_CATEGORY,
  DuoAgentPlatformEvent,
  DuoAgentPlatformContext,
} from './duo_agent_platform_tracker';
import { DefaultDuoAgentPlatformTracker } from './default_duo_agent_platform_tracker';

describe('DefaultDuoAgentPlatformTracker', () => {
  let tracker: DefaultDuoAgentPlatformTracker;
  let configService: DefaultConfigService;
  let mockSnowplowService: SnowplowService;
  let logger: Logger;
  let mockStandardContext: StandardContext;

  beforeEach(() => {
    configService = new DefaultConfigService();
    mockSnowplowService = createFakePartial<SnowplowService>({
      trackStructuredEvent: jest.fn(),
      validateContext: jest.fn(),
    });

    mockStandardContext = createFakePartial<StandardContext>({
      build: jest.fn().mockReturnValue({ data: {} }),
    });

    logger = new TestLogger();
    jest.spyOn(logger, 'warn');
    jest.spyOn(logger, 'debug');
    jest.spyOn(logger, 'info');
    tracker = new DefaultDuoAgentPlatformTracker(
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
  });

  describe('trackEvent', () => {
    const event: DuoAgentPlatformEvent = DuoAgentPlatformEvent.WorkflowStopped;
    const mockContext = createFakePartial<DuoAgentPlatformContext>({});

    it('does not track an event if the standard context is invalid', async () => {
      jest.mocked(mockSnowplowService.validateContext).mockReturnValueOnce(false);
      await tracker.trackEvent(event, mockContext);

      expect(mockSnowplowService.trackStructuredEvent).not.toHaveBeenCalled();
    });

    it('does not track an event if the IDE extension context is invalid', async () => {
      jest
        .mocked(mockSnowplowService.validateContext)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      await tracker.trackEvent(event, mockContext);

      expect(mockSnowplowService.trackStructuredEvent).not.toHaveBeenCalled();
    });

    it('logs a warning if tracking fails', async () => {
      jest.mocked(mockSnowplowService.validateContext).mockReturnValue(true);
      (mockSnowplowService.trackStructuredEvent as jest.Mock).mockRejectedValueOnce(
        new Error('tracking error'),
      );

      await tracker.trackEvent(event, mockContext);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to track telemetry event: ${event}`),
        expect.any(Error),
      );
    });

    it('logs debug message on successful tracking', async () => {
      jest.mocked(mockSnowplowService.validateContext).mockReturnValue(true);

      await tracker.trackEvent(event, mockContext);

      expect(logger.debug).toHaveBeenCalled();
    });

    describe('ToolApprovalSubmitted event', () => {
      beforeEach(() => {
        jest.mocked(mockSnowplowService.validateContext).mockReturnValue(true);
      });

      it('does not set label for tool approval events', async () => {
        await tracker.trackEvent(DuoAgentPlatformEvent.ToolApprovalSubmitted, {
          source: 'chat',
          toolName: 'shell_command',
          approvalScope: 'once',
        });

        expect(mockSnowplowService.trackStructuredEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            category: DUO_AGENT_PLATFORM_CATEGORY,
            action: DuoAgentPlatformEvent.ToolApprovalSubmitted,
          }),
          expect.any(Array),
        );

        const calledEvent = jest.mocked(mockSnowplowService.trackStructuredEvent).mock.calls[0][0];
        expect(calledEvent).not.toHaveProperty('label');
      });

      it('sets value from workflowId when provided', async () => {
        await tracker.trackEvent(DuoAgentPlatformEvent.ToolApprovalSubmitted, {
          source: 'chat',
          toolName: 'shell_command',
          approvalScope: 'once',
          workflowId: '42',
        });

        expect(mockSnowplowService.trackStructuredEvent).toHaveBeenCalledWith(
          expect.objectContaining({ value: 42 }),
          expect.any(Array),
        );
      });

      it('tracks pattern approval scope', async () => {
        await tracker.trackEvent(DuoAgentPlatformEvent.ToolApprovalSubmitted, {
          source: 'chat',
          toolName: 'run_command',
          approvalScope: 'pattern',
          workflowId: '99',
        });

        expect(mockSnowplowService.trackStructuredEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            category: DUO_AGENT_PLATFORM_CATEGORY,
            action: DuoAgentPlatformEvent.ToolApprovalSubmitted,
            value: 99,
          }),
          expect.any(Array),
        );
      });
    });

    describe('WorkflowStopped event', () => {
      beforeEach(() => {
        jest.mocked(mockSnowplowService.validateContext).mockReturnValue(true);
      });

      const workflowId = '1';

      it.each`
        trackingEvent                            | context
        ${DuoAgentPlatformEvent.WorkflowStopped} | ${{ workflowId }}
        ${DuoAgentPlatformEvent.WorkflowStopped} | ${{ source: 'chat', workflowId }}
        ${DuoAgentPlatformEvent.WorkflowStopped} | ${{ source: 'flows', workflowId }}
      `('is called with context: $context', async ({ trackingEvent, context }) => {
        await tracker.trackEvent(trackingEvent, context);

        expect(mockSnowplowService.trackStructuredEvent).toHaveBeenCalledWith(
          {
            category: DUO_AGENT_PLATFORM_CATEGORY,
            action: trackingEvent,
            value: 1,
          },
          expect.any(Array),
        );
      });

      it('passes correct contexts to snowplow service', async () => {
        const mockStandardContextData = {
          schema: 'iglu:com.gitlab/gitlab_standard/jsonschema/1-1-1',
          data: { source: 'test' },
        };
        jest.mocked(mockStandardContext.build).mockReturnValue(mockStandardContextData);

        await tracker.trackEvent(event, { source: 'chat', workflowId: 1 });

        expect(mockSnowplowService.trackStructuredEvent).toHaveBeenCalledWith(
          expect.any(Object),
          expect.arrayContaining([
            mockStandardContextData,
            expect.objectContaining({
              schema: 'iglu:com.gitlab/ide_extension_version/jsonschema/1-1-0',
            }),
          ]),
        );
      });
    });
  });

  describe('configuration changes', () => {
    it('updates enabled state when telemetry config changes', () => {
      expect(tracker.isEnabled()).toBe(true);

      configService.set('telemetry.enabled', false);
      expect(tracker.isEnabled()).toBe(false);

      configService.set('telemetry.enabled', true);
      expect(tracker.isEnabled()).toBe(true);
    });

    it('logs warning when telemetry is disabled', () => {
      configService.set('telemetry.enabled', false);

      expect(logger.warn).toHaveBeenCalled();
    });

    it('logs info when telemetry is enabled', () => {
      configService.set('telemetry.enabled', false);
      jest.clearAllMocks();

      configService.set('telemetry.enabled', true);

      expect(logger.info).toHaveBeenCalled();
    });

    it('updates client context when config changes', async () => {
      configService.set('telemetry.extension.name', 'test-extension');
      configService.set('telemetry.extension.version', '1.0.0');
      configService.set('telemetry.ide.name', 'test-ide');
      configService.set('telemetry.ide.vendor', 'test-vendor');
      configService.set('telemetry.ide.version', '2.0.0');

      jest.mocked(mockSnowplowService.validateContext).mockReturnValue(true);

      await tracker.trackEvent(DuoAgentPlatformEvent.WorkflowStopped);

      expect(mockSnowplowService.trackStructuredEvent).toHaveBeenCalledWith(
        expect.any(Object),
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              extension_name: 'test-extension',
              extension_version: '1.0.0',
              ide_name: 'test-ide',
              ide_vendor: 'test-vendor',
              ide_version: '2.0.0',
            }),
          }),
        ]),
      );
    });
  });
});
