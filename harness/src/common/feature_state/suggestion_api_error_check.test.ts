import {
  ApiRequest,
  CIRCUIT_BREAK_INTERVAL_MS,
  MAX_ERRORS_BEFORE_CIRCUIT_BREAK,
  FetchError,
  NetworkError,
  AbortError as CoreAbortError,
} from '@gitlab-org/core';
import { AbortError as ResiliencyAbortError } from '@gitlab-org/resiliency';
import { createFakePartial, createFakeResponse } from '@gitlab-org/test-utils';
import {
  DefaultSuggestionApiErrorCheck,
  SuggestionApiErrorCheck,
} from './suggestion_api_error_check';

jest.useFakeTimers();

const createMockError = () => {
  const request = createFakePartial<ApiRequest<unknown>>({});
  const response = createFakeResponse({
    url: 'https://example.com/api/v4/code_suggestions/completions',
    status: 401,
    text: 'Some error',
  });
  const body = `{ "error": "some_error" }`;
  return new FetchError(request, response, 'completion', body);
};

const createMockRequest = () =>
  createFakePartial<ApiRequest<unknown>>({
    type: 'rest',
    method: 'POST',
    path: '/api/v4/code_suggestions/completions',
  });

describe('SuggestionApiErrorCheck', () => {
  let check: SuggestionApiErrorCheck;
  let onChangeListener: jest.Mock;

  // Helper to call error() multiple times
  const reportErrors = (error: Error | undefined, times: number) => {
    for (let i = 0; i < times; i++) {
      check.error(error);
    }
  };

  beforeEach(() => {
    check = new DefaultSuggestionApiErrorCheck();
    onChangeListener = jest.fn();
    check.onChanged(onChangeListener);
  });

  it('fires when engaged', () => {
    reportErrors(undefined, MAX_ERRORS_BEFORE_CIRCUIT_BREAK);

    expect(check.engaged).toBe(true);
    expect(onChangeListener).toHaveBeenCalledWith({
      checkId: check.id,
      details: check.details,
      engaged: true,
    });
  });

  it('fires when disengaged', () => {
    reportErrors(undefined, MAX_ERRORS_BEFORE_CIRCUIT_BREAK);
    onChangeListener.mockClear();

    check.success();

    expect(check.engaged).toBe(false);
    expect(onChangeListener).toHaveBeenCalledWith({
      checkId: check.id,
      details: check.details,
      engaged: false,
    });
  });

  it('fires after timeout', () => {
    reportErrors(undefined, MAX_ERRORS_BEFORE_CIRCUIT_BREAK);
    onChangeListener.mockClear();

    jest.advanceTimersByTime(CIRCUIT_BREAK_INTERVAL_MS + 1);

    expect(check.engaged).toBe(false);
    expect(onChangeListener).toHaveBeenCalledWith({
      checkId: check.id,
      details: check.details,
      engaged: false,
    });
  });

  it('fires with error when provided', () => {
    const mockError = createMockError();
    reportErrors(mockError, MAX_ERRORS_BEFORE_CIRCUIT_BREAK);

    expect(onChangeListener).toHaveBeenCalledWith({
      checkId: check.id,
      details: check.details,
      engaged: true,
      error: mockError,
    });
  });

  describe('abort error handling', () => {
    const request = createMockRequest();

    // Factory functions for different abort error types
    const abortErrorTypes = [
      {
        name: 'ResiliencyAbortError',
        create: () => new ResiliencyAbortError('User cancelled'),
      },
      {
        name: 'native AbortError',
        create: () => {
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          return error;
        },
      },
      {
        name: 'CoreAbortError',
        create: () => new CoreAbortError(request, 'Request cancelled'),
      },
      {
        name: 'NetworkError wrapping ResiliencyAbortError',
        create: () => new NetworkError(request, new ResiliencyAbortError('User cancelled')),
      },
      {
        name: 'NetworkError wrapping native AbortError',
        create: () => {
          const nativeAbort = new Error('The operation was aborted');
          nativeAbort.name = 'AbortError';
          return new NetworkError(request, nativeAbort);
        },
      },
    ];

    it.each(abortErrorTypes)(
      'does not count $name toward circuit breaker threshold',
      ({ create }) => {
        reportErrors(create(), MAX_ERRORS_BEFORE_CIRCUIT_BREAK);

        expect(check.engaged).toBe(false);
        expect(onChangeListener).not.toHaveBeenCalled();
      },
    );

    it('still counts real errors toward circuit breaker threshold', () => {
      const realError = createMockError();
      reportErrors(realError, MAX_ERRORS_BEFORE_CIRCUIT_BREAK);

      expect(check.engaged).toBe(true);
      expect(onChangeListener).toHaveBeenCalledWith({
        checkId: check.id,
        details: check.details,
        engaged: true,
        error: realError,
      });
    });

    it('still counts NetworkError wrapping real error toward circuit breaker threshold', () => {
      const networkError = new NetworkError(request, new Error('Network timeout'));
      reportErrors(networkError, MAX_ERRORS_BEFORE_CIRCUIT_BREAK);

      expect(check.engaged).toBe(true);
      expect(onChangeListener).toHaveBeenCalledWith({
        checkId: check.id,
        details: check.details,
        engaged: true,
        error: networkError,
      });
    });

    it('allows mixing abort errors and real errors without triggering circuit breaker prematurely', () => {
      const abortError = new ResiliencyAbortError('User cancelled');
      const realError = createMockError();

      const errors = [];
      for (let i = 0; i < MAX_ERRORS_BEFORE_CIRCUIT_BREAK - 1; i++) {
        errors.push(abortError, realError);
      }
      errors.forEach((err) => check.error(err));

      // Circuit breaker should NOT be open yet
      expect(check.engaged).toBe(false);

      // One more real error should open it
      check.error(realError);
      expect(check.engaged).toBe(true);
    });

    it('can recover from real errors after success despite abort errors', () => {
      const abortError = new ResiliencyAbortError('User cancelled');
      const realError = createMockError();

      reportErrors(realError, MAX_ERRORS_BEFORE_CIRCUIT_BREAK);
      expect(check.engaged).toBe(true);

      // Mix of abort errors and success - should close circuit breaker
      check.error(abortError); // Should not affect state
      check.success();
      check.error(abortError); // Should not affect state

      expect(check.engaged).toBe(false);
    });
  });
});
