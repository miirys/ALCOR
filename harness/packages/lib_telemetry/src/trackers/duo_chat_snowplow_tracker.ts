import { createInterfaceId } from '@gitlab/needle';
import { TelemetryService } from '../service';

export const DUO_CHAT_CATEGORY = 'ask_gitlab_chat';

export enum DUO_CHAT_EVENT {
  // this eslint violation predates the new enum naming rules
  // eslint-disable-next-line @typescript-eslint/naming-convention
  BTN_CLICK = 'click_button',
  // this eslint violation predates the new enum naming rules
  // eslint-disable-next-line @typescript-eslint/naming-convention
  TERMINAL_ACTION_CLICKED = 'terminal_tool_window_action_clicked',
}

export interface TrackFeedbackContext {
  improveWhat: string | null;
  didWhat: string | null;
  feedbackChoices: string[] | null;
}

export const isTrackFeedbackContext = (obj: unknown): obj is TrackFeedbackContext => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    ('improveWhat' in obj ? !obj.improveWhat || typeof obj.improveWhat === 'string' : false) &&
    ('didWhat' in obj ? !obj.didWhat || typeof obj.didWhat === 'string' : false) &&
    ('feedbackChoices' in obj
      ? !obj.feedbackChoices ||
        (Array.isArray(obj.feedbackChoices) &&
          obj.feedbackChoices.every((choice) => typeof choice === 'string'))
      : false)
  );
};

export type DuoChatContext = TrackFeedbackContext | Record<string, never>;

export interface DuoChatSnowplowTracker
  extends TelemetryService<DUO_CHAT_EVENT, DuoChatContext, null> {}
export const DuoChatSnowplowTracker =
  createInterfaceId<DuoChatSnowplowTracker>('DuoChatSnowplowTracker');
