import { NotificationHandler } from 'vscode-languageserver-protocol';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { ConfigService, CODE_SUGGESTIONS_TRACKING_EVENTS } from '@gitlab-org/config';
import { HandlesNotification } from '../../handler';
import { CODE_SUGGESTIONS_CATEGORY } from '../../tracking/code_suggestions/constants';
import {
  QuickChatSnowplowTracker,
  QUICK_CHAT_CATEGORY,
} from '../../tracking/quick_chat/quick_chat_snowplow_tracker';
import { canClientTrackEvent } from '../../tracking/code_suggestions/utils';
import { CodeSuggestionsTelemetryTracker } from '../../tracking/code_suggestions/code_suggestions_multi_tracker';
import { TelemetryNotificationParams } from '../../notifications';
import {
  SECURITY_DIAGNOSTICS_CATEGORY,
  SecurityDiagnosticsTracker,
} from '../../tracking/security_scan/security_diagnostics_tracker';

export interface TelemetryNotificationHandler
  extends HandlesNotification<TelemetryNotificationParams> {}

export const TelemetryNotificationHandler = createInterfaceId<TelemetryNotificationHandler>(
  'TelemetryNotificationHandler',
);

@Injectable(TelemetryNotificationHandler, [
  ConfigService,
  CodeSuggestionsTelemetryTracker,
  QuickChatSnowplowTracker,
  SecurityDiagnosticsTracker,
])
export class DefaultTelemetryNotificationHandler implements TelemetryNotificationHandler {
  #configService: ConfigService;

  #codeSuggestionsTelemetryTracker: CodeSuggestionsTelemetryTracker;

  #quickChatTelemetryTracker: QuickChatSnowplowTracker;

  #securityDiagnosticsTracker: SecurityDiagnosticsTracker;

  constructor(
    configService: ConfigService,
    codeSuggestionsTelemetryTracker: CodeSuggestionsTelemetryTracker,
    quickChatTelemetryTracker: QuickChatSnowplowTracker,
    securityDiagnosticsTracker: SecurityDiagnosticsTracker,
  ) {
    this.#configService = configService;
    this.#codeSuggestionsTelemetryTracker = codeSuggestionsTelemetryTracker;
    this.#quickChatTelemetryTracker = quickChatTelemetryTracker;
    this.#securityDiagnosticsTracker = securityDiagnosticsTracker;
  }

  notificationHandler: NotificationHandler<TelemetryNotificationParams> = async ({
    category,
    action,
    context,
  }: TelemetryNotificationParams) => {
    if (category === CODE_SUGGESTIONS_CATEGORY) {
      const { trackingId: uniqueTrackingId, optionId } = context;

      if (
        uniqueTrackingId &&
        canClientTrackEvent(this.#configService.get('telemetry.actions'), action)
      ) {
        switch (action) {
          case CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED:
            if (optionId) {
              this.#codeSuggestionsTelemetryTracker.setTrackingContext?.({
                uniqueTrackingId,
                context: { acceptedOption: optionId },
              });
            }
            this.#codeSuggestionsTelemetryTracker.trackEvent(
              CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED,
              uniqueTrackingId,
            );
            break;
          case CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED:
            this.#codeSuggestionsTelemetryTracker.trackEvent(
              CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED,
              uniqueTrackingId,
            );
            break;
          case CODE_SUGGESTIONS_TRACKING_EVENTS.CANCELLED:
            this.#codeSuggestionsTelemetryTracker.trackEvent(
              CODE_SUGGESTIONS_TRACKING_EVENTS.CANCELLED,
              uniqueTrackingId,
            );
            break;
          case CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN:
            this.#codeSuggestionsTelemetryTracker.trackEvent(
              CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN,
              uniqueTrackingId,
            );
            break;
          case CODE_SUGGESTIONS_TRACKING_EVENTS.NOT_PROVIDED:
            this.#codeSuggestionsTelemetryTracker.trackEvent(
              CODE_SUGGESTIONS_TRACKING_EVENTS.NOT_PROVIDED,
              uniqueTrackingId,
            );
            break;
          default:
            break;
        }
      }
    } else if (category === QUICK_CHAT_CATEGORY) {
      this.#quickChatTelemetryTracker.trackEvent(action, context);
    } else if (category === SECURITY_DIAGNOSTICS_CATEGORY) {
      this.#securityDiagnosticsTracker.trackEvent(action, context);
    }
  };
}
