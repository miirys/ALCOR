/**
 * Duo Chat Performance Metrics
 *
 * Manages the state transitions for chat performance tracking.
 *
 * States:
 * - idle: Initial state, waiting for user interaction
 * - interaction_sent: User has sent a message, approved a tool, rejected a tool, or approved a plan.
 * - first_visible_progress: As soon as a non-user message becomes visible in the chat UI.
 * - completed: Chat interaction completed and waiting for user to interact again.
 * - error: Chat errored (not recorded as a metric).
 *
 * Metrics:
 * - time_to_first_token_streamed: Time taken from interaction_sent state to first_visible_progress state.
 * - time_to_awaiting_user_input: Time taken from interaction_sent state to completed state.
 */
export const STATE = Object.freeze({
  Idle: 'idle',
  InteractionSent: 'interactionSent',
  FirstVisibleProgress: 'firstVisibleProgress',
  Completed: 'completed',
  Error: 'error',
});

const METRIC = Object.freeze({
  TimeToFirstTokenStreamed: 'time_to_first_token_streamed',
  TimeToAwaitingUserInput: 'time_to_awaiting_user_input',
  StreamingTime: 'streaming_time',
});

const VALID_TRANSITIONS = Object.freeze({
  [STATE.Idle]: [STATE.InteractionSent],
  [STATE.InteractionSent]: [STATE.FirstVisibleProgress, STATE.Error],
  [STATE.FirstVisibleProgress]: [STATE.Completed, STATE.Error],
  [STATE.Completed]: [STATE.InteractionSent],
  [STATE.Error]: [STATE.InteractionSent],
});

const METRICS_TO_STATES = [
  {
    metric: METRIC.TimeToFirstTokenStreamed,
    start: STATE.InteractionSent,
    end: STATE.FirstVisibleProgress,
  },
  {
    metric: METRIC.TimeToAwaitingUserInput,
    start: STATE.InteractionSent,
    end: STATE.Completed,
  },
  {
    metric: METRIC.StreamingTime,
    start: STATE.FirstVisibleProgress,
    end: STATE.Completed,
  },
];

const isValidTransition = (fromState, toState) =>
  VALID_TRANSITIONS[fromState]?.includes(toState) || false;

export const INTERACTION_TYPE = {
  InitialRequest: 'initial_request',
  Continuation: 'continuation',
  ToolApproval: 'tool_approval',
  ToolRejection: 'tool_rejection',
  PlanApproval: 'plan_approval',
};

export class DuoChatPerformanceMetrics {
  #onMetricCallbacks = [];

  #onMarkCallbacks = [];

  #currentState = STATE.Idle;

  #interactionType = '';

  /**
   * Transition to a new state (private method)
   * @param {string} newState - Target state
   * @throws {Error} If transition is invalid
   * @private
   */
  #transitionTo(newState) {
    if (!Object.values(STATE).includes(newState)) {
      return;
    }

    if (!isValidTransition(this.#currentState, newState)) {
      return;
    }

    this.#currentState = newState;
    this.#captureMetrics();
  }

  #captureMetrics() {
    const mark = performance.mark(this.#currentState);

    this.#onMarkCallbacks.forEach((callback) => {
      callback({
        name: mark.name,
        startTime: mark.startTime,
        timestamp: performance.timeOrigin + mark.startTime,
        detail: { interactionType: this.#interactionType },
      });
    });

    const metricsToState = METRICS_TO_STATES.filter((entry) => entry.end === this.#currentState);

    if (metricsToState.length) {
      for (const { metric, start, end } of metricsToState) {
        const measure = performance.measure(metric, {
          start,
          end,
        });

        this.#onMetricCallbacks.forEach((callback) => {
          callback({
            name: measure.name,
            duration: measure.duration,
            detail: { interactionType: this.#interactionType },
          });
        });
      }
    }
  }

  getCurrentState() {
    return this.#currentState;
  }

  notifyInteraction(interactionType) {
    this.#interactionType = interactionType;
    this.reset();
    this.#transitionTo(STATE.InteractionSent, { interactionType });
  }

  notifyFirstVisibleProgress() {
    this.#transitionTo(STATE.FirstVisibleProgress);
  }

  notifyCompleted() {
    this.#transitionTo(STATE.Completed);
  }

  notifyError() {
    this.#transitionTo(STATE.Error);
  }

  reset() {
    this.#currentState = STATE.Idle;

    // Clear all performance marks for states
    Object.values(STATE).forEach((state) => {
      const markEntries = performance.getEntriesByName(state, 'mark');
      if (markEntries.length > 0) {
        performance.clearMarks(state);
      }
    });

    // Clear all performance measures for metrics
    Object.values(METRIC).forEach((metric) => {
      const measureEntries = performance.getEntriesByName(metric, 'measure');
      if (measureEntries.length > 0) {
        performance.clearMeasures(metric);
      }
    });
  }

  onMetricReported(callback) {
    if (typeof callback === 'function') {
      this.#onMetricCallbacks.push(callback);
    }
  }

  onMarkReported(callback) {
    if (typeof callback === 'function') {
      this.#onMarkCallbacks.push(callback);
    }
  }

  dispose() {
    this.reset();
    this.#onMetricCallbacks.length = 0;
    this.#onMarkCallbacks.length = 0;
  }
}

const getStateLabel = (state, detail = {}) => {
  switch (state) {
    case STATE.InteractionSent:
      return `User has started an interaction with type ${detail.interactionType}`;
    case STATE.FirstVisibleProgress:
      return 'Chat displayed first visible progress';
    case STATE.Completed:
      return 'Chat interaction completed and waiting for user to interact again';
    default:
      return state;
  }
};

const getMetricLabel = (metric) => {
  switch (metric) {
    case METRIC.TimeToFirstTokenStreamed:
      return 'Time to first token streamed';
    case METRIC.TimeToAwaitingUserInput:
      return 'Time to awaiting user input';
    case METRIC.StreamingTime:
      return 'Streaming time';
    default:
      return metric;
  }
};

export const displayPerformanceMark = (mark) =>
  `[performance-mark] ${getStateLabel(mark.name, mark.detail)} | ${new Date(
    mark.timestamp,
  ).toUTCString()}`;

export const displayPerformanceMetric = (metric) =>
  `[performance-metric] ${getMetricLabel(metric.name)} | ${
    metric.duration / 1000
  }s | ${JSON.stringify(metric.detail)}`;
