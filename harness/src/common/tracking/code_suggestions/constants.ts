/*
Custom notifications need to be sent from Client to Server to notify about the event:
suggestion_accepted, suggestion_rejected, suggestion_cancelled

The server knows when event happens:
suggestion_requested, suggestion_loaded, suggestion_not_provided, suggestion_error, suggestion_shown

---------------------------------------------------------------------------------
***************Suggestion tracking*******************************************
suggestion_requested: Sent when the IDE extension requests a suggestion
suggestion_loaded: Sent when the suggestion request came back
suggestion_not_provided: Sent when the suggestion request came back empty
suggestion_error: Sent when the suggestion request leads to an error
suggestion_shown: Sent when the suggestion is started to be shown to the user
suggestion_accepted: Sent when the suggestion was accepted
suggestion_rejected: Sent when the suggestion was rejected
suggestion_cancelled: Sent when the suggestion request was canceled
stream_started: Tracked for generations only when the first chunk of stream was received.
stream_completed: Tracked for generations only when the stream has completed.
---------------------------------------------------------------------------------
 */
import { CODE_SUGGESTIONS_TRACKING_EVENTS } from '@gitlab-org/config';

const END_STATE_NO_TRANSITIONS_ALLOWED: CODE_SUGGESTIONS_TRACKING_EVENTS[] = [];

const endStatesGraph = new Map<
  CODE_SUGGESTIONS_TRACKING_EVENTS,
  CODE_SUGGESTIONS_TRACKING_EVENTS[]
>([
  [CODE_SUGGESTIONS_TRACKING_EVENTS.ERRORED, END_STATE_NO_TRANSITIONS_ALLOWED],
  [CODE_SUGGESTIONS_TRACKING_EVENTS.CANCELLED, END_STATE_NO_TRANSITIONS_ALLOWED],
  [CODE_SUGGESTIONS_TRACKING_EVENTS.NOT_PROVIDED, END_STATE_NO_TRANSITIONS_ALLOWED],
  [CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED, END_STATE_NO_TRANSITIONS_ALLOWED],
  [CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED, END_STATE_NO_TRANSITIONS_ALLOWED],
]);

export const nonStreamingSuggestionStateGraph = new Map<
  CODE_SUGGESTIONS_TRACKING_EVENTS,
  CODE_SUGGESTIONS_TRACKING_EVENTS[]
>([
  [
    CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED,
    [CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED, CODE_SUGGESTIONS_TRACKING_EVENTS.ERRORED],
  ],
  [
    CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED,
    [
      CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN,
      CODE_SUGGESTIONS_TRACKING_EVENTS.CANCELLED,
      CODE_SUGGESTIONS_TRACKING_EVENTS.NOT_PROVIDED,
    ],
  ],
  [
    CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN,
    [CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED, CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED],
  ],
  ...endStatesGraph,
]);

export const streamingSuggestionStateGraph = new Map<
  CODE_SUGGESTIONS_TRACKING_EVENTS,
  CODE_SUGGESTIONS_TRACKING_EVENTS[]
>([
  [
    CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED,
    [
      CODE_SUGGESTIONS_TRACKING_EVENTS.STREAM_STARTED,
      CODE_SUGGESTIONS_TRACKING_EVENTS.ERRORED,
      CODE_SUGGESTIONS_TRACKING_EVENTS.CANCELLED,
    ],
  ],
  [
    CODE_SUGGESTIONS_TRACKING_EVENTS.STREAM_STARTED,
    [
      CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN,
      CODE_SUGGESTIONS_TRACKING_EVENTS.ERRORED,
      CODE_SUGGESTIONS_TRACKING_EVENTS.STREAM_COMPLETED,
    ],
  ],
  [
    CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN,
    [
      CODE_SUGGESTIONS_TRACKING_EVENTS.ERRORED,
      CODE_SUGGESTIONS_TRACKING_EVENTS.STREAM_COMPLETED,
      CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED,
      CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED,
    ],
  ],
  [
    CODE_SUGGESTIONS_TRACKING_EVENTS.STREAM_COMPLETED,
    [
      CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED,
      CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED,
      CODE_SUGGESTIONS_TRACKING_EVENTS.NOT_PROVIDED,
      CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN,
    ],
  ],
  ...endStatesGraph,
]);

export const endStates = [...endStatesGraph].map(([state]) => state);

export const CODE_SUGGESTIONS_CATEGORY = 'code_suggestions';

export const INSTANCE_TRACKING_EVENTS_MAP = {
  [CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED]: null,
  [CODE_SUGGESTIONS_TRACKING_EVENTS.LOADED]: null,
  [CODE_SUGGESTIONS_TRACKING_EVENTS.NOT_PROVIDED]: null,
  [CODE_SUGGESTIONS_TRACKING_EVENTS.SHOWN]: 'code_suggestion_shown_in_ide',
  [CODE_SUGGESTIONS_TRACKING_EVENTS.ERRORED]: null,
  [CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED]: 'code_suggestion_accepted_in_ide',
  [CODE_SUGGESTIONS_TRACKING_EVENTS.REJECTED]: 'code_suggestion_rejected_in_ide',
  [CODE_SUGGESTIONS_TRACKING_EVENTS.CANCELLED]: null,
  [CODE_SUGGESTIONS_TRACKING_EVENTS.STREAM_STARTED]: null,
  [CODE_SUGGESTIONS_TRACKING_EVENTS.STREAM_COMPLETED]: null,
};

export const TELEMETRY_DISABLED_WARNING_MSG =
  'GitLab Duo Code Suggestions telemetry is disabled. Please consider enabling telemetry to help improve our service.';
export const TELEMETRY_ENABLED_MSG = 'GitLab Duo Code Suggestions telemetry is enabled.';
export const TELEMETRY_ENABLED_SELF_MANAGED_MSG =
  'GitLab Duo Code Suggestions telemetry is always enabled in self-managed instances.';
