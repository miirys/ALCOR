import { createFakePartial } from '@gitlab-org/test-utils';
import {
  ConfigService,
  DefaultConfigService,
  CODE_SUGGESTIONS_TRACKING_EVENTS,
} from '@gitlab-org/config';
import { CodeSuggestionsTelemetryTracker } from '../../tracking/code_suggestions/code_suggestions_multi_tracker';
import { CODE_SUGGESTIONS_CATEGORY } from '../../tracking/code_suggestions/constants';
import { canClientTrackEvent } from '../../tracking/code_suggestions/utils';
import { QuickChatSnowplowTracker } from '../../tracking/quick_chat/quick_chat_snowplow_tracker';
import { SecurityDiagnosticsTracker } from '../../tracking/security_scan/security_diagnostics_tracker';
import {
  DefaultTelemetryNotificationHandler,
  TelemetryNotificationHandler,
} from './telemetry_notification_handler';

jest.mock('../../tracking/code_suggestions/utils');
describe('TelemetryNotificationHandler', () => {
  let configService: ConfigService;
  let codeSuggestionsTelemetryTracker: CodeSuggestionsTelemetryTracker;
  let quickChatTelemetryTracker: QuickChatSnowplowTracker;
  let securityTelemetryTracker: SecurityDiagnosticsTracker;
  let handler: TelemetryNotificationHandler;

  beforeEach(() => {
    configService = new DefaultConfigService();
    codeSuggestionsTelemetryTracker = createFakePartial<CodeSuggestionsTelemetryTracker>({
      setTrackingContext: jest.fn(),
      trackEvent: jest.fn(),
    });

    quickChatTelemetryTracker = createFakePartial<QuickChatSnowplowTracker>({
      setTrackingContext: jest.fn(),
      trackEvent: jest.fn(),
    });

    securityTelemetryTracker = createFakePartial<SecurityDiagnosticsTracker>({
      setTrackingContext: jest.fn(),
      trackEvent: jest.fn(),
    });

    handler = new DefaultTelemetryNotificationHandler(
      configService,
      codeSuggestionsTelemetryTracker,
      quickChatTelemetryTracker,
      securityTelemetryTracker,
    );

    jest.spyOn(configService, 'set');
  });

  afterEach(() => {
    (
      Object.keys(codeSuggestionsTelemetryTracker) as (keyof CodeSuggestionsTelemetryTracker)[]
    ).forEach((mockTrackingMethod) => {
      (codeSuggestionsTelemetryTracker[mockTrackingMethod] as jest.Mock).mockReset();
    });
  });

  const trackingId = 'uniqueId';
  describe.each([
    [CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED],
    [CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED],
    [CODE_SUGGESTIONS_TRACKING_EVENTS.CANCELLED],
    [CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN],
    [CODE_SUGGESTIONS_TRACKING_EVENTS.NOT_PROVIDED],
  ])('%s event', (trackingEvent: CODE_SUGGESTIONS_TRACKING_EVENTS) => {
    it('should be tracked when client can notify about it', async () => {
      jest.mocked(canClientTrackEvent).mockReturnValueOnce(true);

      await handler.notificationHandler({
        category: CODE_SUGGESTIONS_CATEGORY,
        action: trackingEvent,
        context: {
          trackingId,
        },
      });

      expect(codeSuggestionsTelemetryTracker.trackEvent).toHaveBeenCalledWith(
        trackingEvent,
        trackingId,
      );
    });

    it('should NOT be tracked when client cannot notify about it', () => {
      (canClientTrackEvent as jest.Mock).mockReturnValueOnce(false);
      expect(
        handler.notificationHandler({
          category: CODE_SUGGESTIONS_CATEGORY,
          action: trackingEvent,
          context: {
            trackingId,
          },
        }),
      );
      expect(codeSuggestionsTelemetryTracker.trackEvent).not.toHaveBeenCalledWith(
        trackingEvent,
        trackingId,
      );
    });
  });

  it('should update suggestion state with accepted option when suggestion accepted', async () => {
    jest.mocked(canClientTrackEvent).mockReturnValueOnce(true);
    const optionId = 1;
    await handler.notificationHandler({
      category: CODE_SUGGESTIONS_CATEGORY,
      action: CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED,
      context: {
        trackingId,
        optionId,
      },
    });

    expect(codeSuggestionsTelemetryTracker.setTrackingContext).toHaveBeenCalledWith({
      uniqueTrackingId: trackingId,
      context: {
        acceptedOption: optionId,
      },
    });
  });
});
