import {
  CIRCUIT_BREAK_INTERVAL_MS,
  FixedTimeCircuitBreaker,
  GitLabApiService,
} from '@gitlab-org/core';
import { Logger, TestLogger } from '@gitlab-org/logging';
import { DUO_WORKFLOW_EVENT, DuoWorkflowContext } from '@gitlab-org/telemetry';
import { createFakePartial } from '@gitlab-org/test-utils';
import { ConfigService, DefaultConfigService } from '@gitlab-org/config';
import { DefaultDuoWorkflowInstanceTracker } from './duo_workflow_instance_tracker';

describe('DefaultDuoWorkflowInstanceTracker', () => {
  let tracker: DefaultDuoWorkflowInstanceTracker;
  let configService: ConfigService;
  let mockApiService: GitLabApiService;
  let logger: Logger;

  const mockContext: DuoWorkflowContext = {
    workflow_id: 'workflow-123',
  };

  beforeEach(() => {
    configService = new DefaultConfigService();
    mockApiService = createFakePartial<GitLabApiService>({
      fetchFromApi: jest.fn().mockResolvedValue(undefined),
    });

    logger = new TestLogger();
    jest.spyOn(logger, 'error');
    jest.spyOn(logger, 'debug');

    tracker = new DefaultDuoWorkflowInstanceTracker(mockApiService, configService, logger);
  });

  describe('isEnabled', () => {
    it('should return true by default', () => {
      expect(tracker.isEnabled()).toBe(true);
    });

    it('should return false when telemetry is disabled', () => {
      configService.set('telemetry.enabled', false);

      expect(tracker.isEnabled()).toBe(false);
    });

    it('should return false when circuit breaker is open', () => {
      const spy = jest.spyOn(FixedTimeCircuitBreaker.prototype, 'isOpen').mockReturnValue(true);

      expect(tracker.isEnabled()).toBe(false);

      spy.mockRestore();
    });
  });

  describe('trackEvent', () => {
    describe('when telemetry is disabled', () => {
      beforeEach(() => {
        configService.set('telemetry.enabled', false);
      });

      it('should not track events when disabled', () => {
        tracker.trackEvent(DUO_WORKFLOW_EVENT.START, mockContext);

        expect(mockApiService.fetchFromApi).not.toHaveBeenCalled();
        expect(logger.debug).not.toHaveBeenCalled();
      });
    });

    describe('when telemetry is enabled', () => {
      beforeEach(() => {
        configService.set('telemetry.enabled', true);
      });

      it.each([DUO_WORKFLOW_EVENT.START, DUO_WORKFLOW_EVENT.FINISH, DUO_WORKFLOW_EVENT.RETRY])(
        'should track %s event with correct data',
        (event) => {
          tracker.trackEvent(event, mockContext);

          expect(mockApiService.fetchFromApi).toHaveBeenCalledWith({
            type: 'rest',
            method: 'POST',
            path: '/api/v4/usage_data/track_event',
            body: {
              event,
              additional_properties: {
                workflow_id: 'workflow-123',
              },
              send_to_snowplow: true,
            },
          });
        },
      );

      it('should update circuit breaker on API success', async () => {
        const circuitBreakerSpy = jest.spyOn(FixedTimeCircuitBreaker.prototype, 'success');

        tracker.trackEvent(DUO_WORKFLOW_EVENT.START, mockContext);

        // Wait for the promise to resolve
        await Promise.resolve();

        expect(circuitBreakerSpy).toHaveBeenCalled();
      });

      it('should update circuit breaker on API error', async () => {
        const circuitBreakerSpy = jest.spyOn(FixedTimeCircuitBreaker.prototype, 'error');
        jest.mocked(mockApiService.fetchFromApi).mockRejectedValue(new Error('API failure'));

        tracker.trackEvent(DUO_WORKFLOW_EVENT.START, mockContext);

        // Wait for the promise to resolve
        await Promise.resolve();

        expect(circuitBreakerSpy).toHaveBeenCalled();
      });
    });
  });

  describe('Circuit breaking', () => {
    beforeEach(async () => {
      jest.useFakeTimers();

      jest.mocked(mockApiService.fetchFromApi).mockRejectedValue(new Error('API failure'));

      // Track multiple events to trigger circuit breaker
      tracker.trackEvent(DUO_WORKFLOW_EVENT.START, mockContext);
      await Promise.resolve();
      tracker.trackEvent(DUO_WORKFLOW_EVENT.START, mockContext);
      await Promise.resolve();
      tracker.trackEvent(DUO_WORKFLOW_EVENT.START, mockContext);
      await Promise.resolve();
      tracker.trackEvent(DUO_WORKFLOW_EVENT.START, mockContext);
      await Promise.resolve();

      // Circuit breaker should be open now, reset the mocks before our tests assert
      // eslint-disable-next-line no-restricted-syntax
      jest.clearAllMocks();
      jest.mocked(mockApiService.fetchFromApi).mockResolvedValue(undefined);
    });

    afterEach(() => jest.useRealTimers());

    it('should stop tracking after multiple errors', async () => {
      // This shouldn't make an API call because the circuit is open
      tracker.trackEvent(DUO_WORKFLOW_EVENT.START, mockContext);
      expect(mockApiService.fetchFromApi).not.toHaveBeenCalled();
    });

    it('should resume tracking after circuit breaker timeout', async () => {
      // Advance time past the circuit breaker timeout
      jest.advanceTimersByTime(CIRCUIT_BREAK_INTERVAL_MS + 100);

      // Now it should track again
      tracker.trackEvent(DUO_WORKFLOW_EVENT.START, mockContext);

      expect(mockApiService.fetchFromApi).toHaveBeenCalled();
    });
  });
});
