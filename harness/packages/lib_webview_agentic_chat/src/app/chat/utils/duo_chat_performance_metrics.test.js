import {
  DuoChatPerformanceMetrics,
  INTERACTION_TYPE,
  STATE,
  displayPerformanceMark,
  displayPerformanceMetric,
} from './duo_chat_performance_metrics';

describe('/app/chat/utils/duo_chat_performance_metrics.js', () => {
  describe('DuoChatPerformanceMetrics', () => {
    let metrics;

    beforeEach(() => {
      metrics = new DuoChatPerformanceMetrics();
      performance.clearMarks();
      performance.clearMeasures();
    });

    afterEach(() => {
      metrics.dispose();
    });

    describe('constructor', () => {
      it('should initialize with idle state', () => {
        expect(metrics.getCurrentState()).toBe(STATE.Idle);
      });
    });

    describe('notifyInteraction', () => {
      it('should transition from idle to interactionSent', () => {
        metrics.notifyInteraction(INTERACTION_TYPE.InitialRequest);

        expect(metrics.getCurrentState()).toBe(STATE.InteractionSent);
      });

      it('should reset before transitioning', () => {
        metrics.notifyInteraction(INTERACTION_TYPE.InitialRequest);
        const resetSpy = jest.spyOn(metrics, 'reset');

        metrics.notifyInteraction(INTERACTION_TYPE.Continuation);

        expect(resetSpy).toHaveBeenCalled();
      });

      it('should work with all interaction types', () => {
        Object.values(INTERACTION_TYPE).forEach((interactionType) => {
          const testMetrics = new DuoChatPerformanceMetrics();

          testMetrics.notifyInteraction(interactionType);

          expect(testMetrics.getCurrentState()).toBe(STATE.InteractionSent);

          testMetrics.dispose();
        });
      });
    });

    describe.each`
      method                          | expectedState                 | metricNames
      ${'notifyFirstVisibleProgress'} | ${STATE.FirstVisibleProgress} | ${['time_to_first_token_streamed']}
      ${'notifyCompleted'}            | ${STATE.Completed}            | ${['time_to_awaiting_user_input', 'streaming_time']}
    `('$method', ({ method, expectedState, metricNames }) => {
      it(`should transition to ${expectedState}`, () => {
        metrics.notifyInteraction(INTERACTION_TYPE.InitialRequest);
        if (method === 'notifyCompleted') {
          metrics.notifyFirstVisibleProgress();
        }
        metrics[method]();

        expect(metrics.getCurrentState()).toBe(expectedState);
      });

      it(`should emit ${metricNames.join(' and ')} metric(s)`, () => {
        const onMetricCallback = jest.fn();
        metrics.onMetricReported(onMetricCallback);

        metrics.notifyInteraction(INTERACTION_TYPE.InitialRequest);
        if (method === 'notifyCompleted') {
          metrics.notifyFirstVisibleProgress();
          onMetricCallback.mockClear();
        }

        metrics[method]();

        expect(onMetricCallback).toHaveBeenCalledTimes(metricNames.length);
        metricNames.forEach((metricName) => {
          expect(onMetricCallback).toHaveBeenCalledWith(
            expect.objectContaining({
              name: metricName,
              duration: expect.any(Number),
              detail: expect.objectContaining({
                interactionType: INTERACTION_TYPE.InitialRequest,
              }),
            }),
          );
        });
      });

      it('should not transition from idle', () => {
        metrics[method]();

        expect(metrics.getCurrentState()).toBe(STATE.Idle);
      });
    });

    describe('notifyError', () => {
      it('should transition from interactionSent to error', () => {
        metrics.notifyInteraction(INTERACTION_TYPE.InitialRequest);
        metrics.notifyError();

        expect(metrics.getCurrentState()).toBe(STATE.Error);
      });

      it('should transition from firstVisibleProgress to error', () => {
        metrics.notifyInteraction(INTERACTION_TYPE.InitialRequest);
        metrics.notifyFirstVisibleProgress();
        metrics.notifyError();

        expect(metrics.getCurrentState()).toBe(STATE.Error);
      });

      it('should allow transition back to interactionSent after error', () => {
        metrics.notifyInteraction(INTERACTION_TYPE.InitialRequest);
        metrics.notifyError();
        metrics.notifyInteraction(INTERACTION_TYPE.Continuation);

        expect(metrics.getCurrentState()).toBe(STATE.InteractionSent);
      });
    });

    describe('reset', () => {
      it('should clear all performance marks', () => {
        metrics.notifyInteraction(INTERACTION_TYPE.InitialRequest);
        metrics.notifyFirstVisibleProgress();

        metrics.reset();

        expect(performance.getEntriesByName('interactionSent', 'mark')).toHaveLength(0);
        expect(performance.getEntriesByName('firstVisibleProgress', 'mark')).toHaveLength(0);
      });

      it('should clear all performance measures', () => {
        metrics.notifyInteraction(INTERACTION_TYPE.InitialRequest);
        metrics.notifyFirstVisibleProgress();
        metrics.notifyCompleted();

        metrics.reset();

        expect(
          performance.getEntriesByName('time_to_first_token_streamed', 'measure'),
        ).toHaveLength(0);
        expect(performance.getEntriesByName('time_to_awaiting_user_input', 'measure')).toHaveLength(
          0,
        );
        expect(performance.getEntriesByName('streaming_time', 'measure')).toHaveLength(0);
      });

      it('should reset current state to idle', () => {
        metrics.notifyInteraction(INTERACTION_TYPE.InitialRequest);
        metrics.reset();

        expect(metrics.getCurrentState()).toBe(STATE.Idle);
      });
    });

    describe('onMetricReported', () => {
      it('should call callback when metric is reported', () => {
        const callback = jest.fn();
        metrics.onMetricReported(callback);

        metrics.notifyInteraction(INTERACTION_TYPE.InitialRequest);
        metrics.notifyFirstVisibleProgress();

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'time_to_first_token_streamed',
            duration: expect.any(Number),
          }),
        );
      });
    });

    describe('onMarkReported', () => {
      it('should call callback when mark is created', () => {
        const callback = jest.fn();
        metrics.onMarkReported(callback);

        metrics.notifyInteraction(INTERACTION_TYPE.InitialRequest);

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'interactionSent',
            startTime: expect.any(Number),
            timestamp: expect.any(Number),
          }),
        );
      });
    });

    describe('dispose', () => {
      it('should clear all callbacks', () => {
        const onMetricCallback = jest.fn();
        const onMarkCallback = jest.fn();
        metrics.onMetricReported(onMetricCallback);
        metrics.onMarkReported(onMarkCallback);

        metrics.dispose();

        metrics.notifyInteraction(INTERACTION_TYPE.InitialRequest);
        metrics.notifyFirstVisibleProgress();

        expect(onMetricCallback).not.toHaveBeenCalled();
        expect(onMarkCallback).not.toHaveBeenCalled();
      });

      it('should reset performance marks and measures', () => {
        metrics.notifyInteraction(INTERACTION_TYPE.InitialRequest);
        metrics.notifyFirstVisibleProgress();
        metrics.notifyCompleted();

        metrics.dispose();

        expect(performance.getEntriesByName('interactionSent', 'mark')).toHaveLength(0);
        expect(
          performance.getEntriesByName('time_to_first_token_streamed', 'measure'),
        ).toHaveLength(0);
        expect(performance.getEntriesByName('streaming_time', 'measure')).toHaveLength(0);
      });
    });
  });

  describe('displayPerformanceMark', () => {
    it.each`
      name                      | timestamp        | detail                                    | expected
      ${'interactionSent'}      | ${1609459200000} | ${{ interactionType: 'initial_request' }} | ${'[performance-mark] User has started an interaction with type initial_request | Fri, 01 Jan 2021 00:00:00 GMT'}
      ${'firstVisibleProgress'} | ${1609459200000} | ${{}}                                     | ${'[performance-mark] Chat displayed first visible progress | Fri, 01 Jan 2021 00:00:00 GMT'}
      ${'completed'}            | ${1609459200000} | ${{}}                                     | ${'[performance-mark] Chat interaction completed and waiting for user to interact again | Fri, 01 Jan 2021 00:00:00 GMT'}
    `('should format mark for $name', ({ name, timestamp, detail, expected }) => {
      const mark = { name, timestamp, detail };
      const result = displayPerformanceMark(mark);
      expect(result).toBe(expected);
    });
  });

  describe('displayPerformanceMetric', () => {
    it.each`
      name                              | duration | detail                                    | expected
      ${'time_to_first_token_streamed'} | ${1500}  | ${{ interactionType: 'initial_request' }} | ${'[performance-metric] Time to first token streamed | 1.5s | {"interactionType":"initial_request"}'}
      ${'time_to_awaiting_user_input'}  | ${3000}  | ${{}}                                     | ${'[performance-metric] Time to awaiting user input | 3s | {}'}
      ${'streaming_time'}               | ${2000}  | ${{ interactionType: 'continuation' }}    | ${'[performance-metric] Streaming time | 2s | {"interactionType":"continuation"}'}
    `('should format metric for $name', ({ name, duration, detail, expected }) => {
      const metric = { name, duration, detail };
      const result = displayPerformanceMetric(metric);
      expect(result).toBe(expected);
    });
  });
});
