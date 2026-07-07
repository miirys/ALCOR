import { DUO_CHAT_EVENT, DuoChatContext, DuoChatSnowplowTracker } from '@gitlab-org/telemetry';
import { NO_REPLY } from './constants';

export const initTelemetryController = (duoChatTracker: DuoChatSnowplowTracker) => ({
  trackFeedback(message: DuoChatContext) {
    duoChatTracker.trackEvent(DUO_CHAT_EVENT.BTN_CLICK, message);

    return NO_REPLY;
  },
});
