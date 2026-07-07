import { DUO_CHAT_EVENT, DuoChatContext, DuoChatSnowplowTracker } from '@gitlab-org/telemetry';
import { createFakePartial } from '@gitlab-org/test-utils';
import { initTelemetryController } from './telemetry';

describe('telemetry controller', () => {
  let controller: ReturnType<typeof initTelemetryController>;
  let mockChatTracker: DuoChatSnowplowTracker;

  beforeEach(() => {
    mockChatTracker = createFakePartial<DuoChatSnowplowTracker>({
      trackEvent: jest.fn(),
    });

    controller = initTelemetryController(mockChatTracker);
  });

  describe('trackFeedback', () => {
    it('sends the event to be tracked', () => {
      const event: DuoChatContext = {
        didWhat: 'did',
        improveWhat: 'improve',
        feedbackChoices: ['abuse'],
      };

      controller.trackFeedback(event);

      expect(mockChatTracker.trackEvent).toHaveBeenCalledWith(DUO_CHAT_EVENT.BTN_CLICK, event);
    });
  });
});
