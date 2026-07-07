import { TestLogger, Logger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DefaultConfigService } from '@gitlab-org/config';
import { SnowplowService, StandardContext } from '@gitlab-org/telemetry';
import {
  DefaultSecurityDiagnosticsTracker,
  SECURITY_DIAGNOSTICS_CATEGORY,
  SECURITY_DIAGNOSTICS_EVENT,
  SecurityDiagnosticsContext,
} from './security_diagnostics_tracker';

describe('DefaultSecurityDiagnosticsTracker', () => {
  let tracker: DefaultSecurityDiagnosticsTracker;
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
    tracker = new DefaultSecurityDiagnosticsTracker(
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
    const event: SECURITY_DIAGNOSTICS_EVENT = SECURITY_DIAGNOSTICS_EVENT.SCAN_INITIATED;
    const mockContext = createFakePartial<SecurityDiagnosticsContext>({});

    it('does not track an event if the context is invalid', async () => {
      jest.mocked(mockSnowplowService.validateContext).mockReturnValue(false);
      await tracker.trackEvent(event, mockContext);

      expect(mockSnowplowService.trackStructuredEvent).not.toHaveBeenCalled();
    });

    it('logs a warning if tracking fails', async () => {
      jest.mocked(mockSnowplowService.validateContext).mockReturnValue(true);
      (mockSnowplowService.trackStructuredEvent as jest.Mock).mockRejectedValueOnce(
        new Error('error'),
      );
      await tracker.trackEvent(event, mockContext);
    });

    describe('scan_initiated event', () => {
      beforeEach(() => {
        jest.mocked(mockSnowplowService.validateContext).mockReturnValue(true);
      });
      it.each`
        trackingEvent                                          | context
        ${SECURITY_DIAGNOSTICS_EVENT.SCAN_INITIATED}           | ${{}}
        ${SECURITY_DIAGNOSTICS_EVENT.SCAN_INITIATED}           | ${{ source: 'command' }}
        ${SECURITY_DIAGNOSTICS_EVENT.SCAN_RESULTS_VIEW_OPENED} | ${{}}
      `('is called with $context', async ({ trackingEvent, context }) => {
        await tracker.trackEvent(trackingEvent, context);
        expect(mockSnowplowService.trackStructuredEvent).toHaveBeenCalledWith(
          {
            category: SECURITY_DIAGNOSTICS_CATEGORY,
            action: trackingEvent,
            label: context?.source,
          },
          expect.any(Array),
        );
      });
    });
  });
});
