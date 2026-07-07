import { TelemetryService } from '@gitlab-org/telemetry';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import {
  CodeSuggestionsTelemetryEvent,
  CodeSuggestionsTelemetryEventContext,
  CodeSuggestionsTelemetryTrackingContext,
} from './code_suggestions_tracking_types';
import { CodeSuggestionsSnowplowTracker } from './code_suggestions_snowplow_tracker';
import { CodeSuggestionsInstanceTracker } from './code_suggestions_instance_tracker';

export interface CodeSuggestionsTelemetryTracker
  extends TelemetryService<
    CodeSuggestionsTelemetryEvent,
    CodeSuggestionsTelemetryEventContext,
    CodeSuggestionsTelemetryTrackingContext
  > {}
export const CodeSuggestionsTelemetryTracker = createInterfaceId<CodeSuggestionsTelemetryTracker>(
  'CodeSuggestionsTelemetryTracker',
);
@Injectable(CodeSuggestionsTelemetryTracker, [
  CodeSuggestionsSnowplowTracker,
  CodeSuggestionsInstanceTracker,
])
export class DefaultCodeSuggestionsMultiTracker implements CodeSuggestionsTelemetryTracker {
  #trackers: TelemetryService<
    CodeSuggestionsTelemetryEvent,
    CodeSuggestionsTelemetryEventContext,
    CodeSuggestionsTelemetryTrackingContext
  >[] = [];

  constructor(
    snowplowTracker: CodeSuggestionsSnowplowTracker,
    instanceTracker: CodeSuggestionsInstanceTracker,
  ) {
    this.#registerTracker(snowplowTracker);
    this.#registerTracker(instanceTracker);
  }

  #registerTracker(
    tracker: TelemetryService<
      CodeSuggestionsTelemetryEvent,
      CodeSuggestionsTelemetryEventContext,
      CodeSuggestionsTelemetryTrackingContext
    >,
  ) {
    this.#trackers.push(tracker);
  }

  get #enabledTrackers() {
    return this.#trackers.filter((t) => t.isEnabled());
  }

  isEnabled(): boolean {
    return Boolean(this.#enabledTrackers.length);
  }

  setTrackingContext({ uniqueTrackingId, context }: CodeSuggestionsTelemetryTrackingContext) {
    this.#enabledTrackers.forEach((t) => {
      if (t.setTrackingContext) {
        t.setTrackingContext?.({ uniqueTrackingId, context });
      }
    });
  }

  trackEvent(
    event: CodeSuggestionsTelemetryEvent,
    uniqueTrackingId: CodeSuggestionsTelemetryEventContext,
  ) {
    this.#enabledTrackers.forEach((t) => t.trackEvent(event, uniqueTrackingId));
  }
}
