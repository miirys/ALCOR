import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { CODE_SUGGESTIONS_TRACKING_EVENTS } from '@gitlab-org/config';
import { Logger, NullLogger } from '@gitlab-org/logging';
import {
  endStates,
  nonStreamingSuggestionStateGraph,
  streamingSuggestionStateGraph,
} from './constants';

export interface CodeSuggestionTelemetryState {
  init(logger: Logger): void;
  canUpdateState(
    uniqueTrackingId: string,
    newState: CODE_SUGGESTIONS_TRACKING_EVENTS,
    isStreaming?: boolean,
  ): boolean;
  updateSuggestionState(
    uniqueTrackingId: string,
    newState: CODE_SUGGESTIONS_TRACKING_EVENTS,
    isStreaming?: boolean,
  ): void;
  getOpenedSuggestions(): string[];
  deleteSuggestion(uniqueTrackingId: string): void;
}

export const CodeSuggestionTelemetryState = createInterfaceId<CodeSuggestionTelemetryState>(
  'CodeSuggestionTelemetryState',
);

@Service({ dependencies: [], lifetime: ServiceLifetime.Transient })
@Implements(CodeSuggestionTelemetryState)
export class DefaultCodeSuggestionTelemetryState implements CodeSuggestionTelemetryState {
  #codeSuggestionStates = new Map<string, CODE_SUGGESTIONS_TRACKING_EVENTS>();

  #logger: Logger = new NullLogger();

  init(logger: Logger) {
    this.#logger = logger;
  }

  canUpdateState(
    uniqueTrackingId: string,
    newState: CODE_SUGGESTIONS_TRACKING_EVENTS,
    isStreaming: boolean = false,
  ): boolean {
    if (newState === CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED) {
      return true;
    }
    const currentState = this.#codeSuggestionStates.get(uniqueTrackingId);

    if (!currentState) {
      this.#logger.debug(`The suggestion with ${uniqueTrackingId} can't be found`);
      return false;
    }

    const allowedTransitions = isStreaming
      ? streamingSuggestionStateGraph.get(currentState as CODE_SUGGESTIONS_TRACKING_EVENTS)
      : nonStreamingSuggestionStateGraph.get(currentState as CODE_SUGGESTIONS_TRACKING_EVENTS);

    if (!allowedTransitions) {
      this.#logger.debug(
        `The suggestion's ${uniqueTrackingId} state ${currentState} can't be found in state graph`,
      );
      return false;
    }

    if (
      !allowedTransitions.includes(newState) &&
      newState !== CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED
    ) {
      this.#logger.debug(
        `Unexpected transition from ${currentState} into ${newState} for ${uniqueTrackingId}`,
      );
      return false;
    }

    return true;
  }

  updateSuggestionState(
    uniqueTrackingId: string,
    newState: CODE_SUGGESTIONS_TRACKING_EVENTS,
    isStreaming: boolean = false,
  ) {
    if (!this.canUpdateState(uniqueTrackingId, newState, isStreaming)) {
      this.#logger.info(`${uniqueTrackingId} state can't be updated.`);
      return;
    }
    const currentState = this.#codeSuggestionStates.get(uniqueTrackingId);
    this.#codeSuggestionStates.set(uniqueTrackingId, newState);

    if (newState === CODE_SUGGESTIONS_TRACKING_EVENTS.REQUESTED) {
      this.#logger.debug(`New suggestion ${uniqueTrackingId} has been requested`);
    } else {
      this.#logger.debug(`${uniqueTrackingId} transitioned from ${currentState} to ${newState}`);
    }
  }

  getOpenedSuggestions(): string[] {
    const openedSuggestionsTrackingIds: string[] = [];
    this.#codeSuggestionStates.forEach((state, uniqueTrackingId) => {
      if (!endStates.includes(state)) {
        openedSuggestionsTrackingIds.push(uniqueTrackingId);
      }
    });
    return openedSuggestionsTrackingIds;
  }

  deleteSuggestion(uniqueTrackingId: string) {
    this.#codeSuggestionStates.delete(uniqueTrackingId);
  }
}
