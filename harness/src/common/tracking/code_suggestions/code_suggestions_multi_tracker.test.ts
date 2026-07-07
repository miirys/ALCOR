import { TelemetryService } from '@gitlab-org/telemetry';
import { createFakePartial } from '@gitlab-org/test-utils';
import { CODE_SUGGESTIONS_TRACKING_EVENTS } from '@gitlab-org/config';
import { DefaultCodeSuggestionsMultiTracker } from './code_suggestions_multi_tracker';
import {
  CodeSuggestionsTelemetryEventContext,
  CodeSuggestionsTelemetryTrackingContext,
} from './code_suggestions_tracking_types';

describe('MultiTracker', () => {
  const createMockTracker = (isEnabled: boolean) =>
    createFakePartial<
      TelemetryService<
        CODE_SUGGESTIONS_TRACKING_EVENTS,
        CodeSuggestionsTelemetryEventContext,
        CodeSuggestionsTelemetryTrackingContext
      >
    >({
      isEnabled: jest.fn().mockReturnValue(isEnabled),
      setTrackingContext: jest.fn(),
      trackEvent: jest.fn(),
    });

  type TestCase = {
    method: keyof TelemetryService<
      CODE_SUGGESTIONS_TRACKING_EVENTS,
      CodeSuggestionsTelemetryEventContext,
      CodeSuggestionsTelemetryTrackingContext
    >;
    args: unknown[];
  };
  const testCases: TestCase[] = [
    {
      method: 'setTrackingContext',
      args: [{ uniqueTrackingId: 'uniqueId', context: { key: 'value' } }],
    },
    {
      method: 'trackEvent',
      args: [CODE_SUGGESTIONS_TRACKING_EVENTS.ACCEPTED, { uniqueTrackingId: 'uniqueId' }],
    },
  ];

  testCases.forEach(({ method, args }) => {
    describe(`${method}`, () => {
      it('should call the method on all enabled trackers', () => {
        const enabledTracker = createMockTracker(true);
        const disabledTracker = createMockTracker(false);

        const multiTracker = new DefaultCodeSuggestionsMultiTracker(
          enabledTracker,
          disabledTracker,
        );

        (multiTracker[method] as jest.Mock)(...args);

        expect(enabledTracker[method]).toHaveBeenCalledWith(...args);
        expect(disabledTracker[method]).not.toHaveBeenCalled();
      });
    });
  });

  describe('isEnabled', () => {
    it('should return true if at least one tracker is enabled', () => {
      const enabledTracker = createMockTracker(true);
      const disabledTracker = createMockTracker(false);

      const multiTracker = new DefaultCodeSuggestionsMultiTracker(enabledTracker, disabledTracker);

      expect(multiTracker.isEnabled()).toBe(true);
    });

    it('should return false if all trackers are disabled', () => {
      const disabledTracker1 = createMockTracker(false);
      const disabledTracker2 = createMockTracker(false);

      const multiTracker = new DefaultCodeSuggestionsMultiTracker(
        disabledTracker1,
        disabledTracker2,
      );

      expect(multiTracker.isEnabled()).toBe(false);
    });
  });
});
