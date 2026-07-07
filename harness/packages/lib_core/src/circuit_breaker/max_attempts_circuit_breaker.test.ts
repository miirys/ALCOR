import { Disposable } from '@gitlab-org/disposable';
import { MaxAttemptsCircuitBreaker } from './max_attempts_circuit_breaker';
import { CircuitBreaker } from './circuit_breaker';

describe('MaxAttemptsCircuitBreaker', () => {
  const createMockInnerBreaker = () => {
    const mockInnerBreaker: jest.Mocked<CircuitBreaker> = {
      error: jest.fn(),
      success: jest.fn(),
      isOpen: jest.fn(),
      onOpen: jest.fn(),
      onClose: jest.fn(),
    };

    mockInnerBreaker.onOpen.mockImplementation(() => ({ dispose: jest.fn() }) as Disposable);
    mockInnerBreaker.onClose.mockImplementation(() => ({ dispose: jest.fn() }) as Disposable);

    return mockInnerBreaker;
  };

  it('delegates isOpen to inner breaker when max attempts not reached', () => {
    const mockInnerBreaker = createMockInnerBreaker();
    mockInnerBreaker.isOpen.mockReturnValue(true);

    const cb = new MaxAttemptsCircuitBreaker(mockInnerBreaker, 3);
    expect(cb.isOpen()).toBe(true);
  });

  it('opens after max number of errors has been reached', () => {
    const mockInnerBreaker = createMockInnerBreaker();
    mockInnerBreaker.isOpen.mockReturnValue(false);

    const cb = new MaxAttemptsCircuitBreaker(mockInnerBreaker, 3);
    const listener = jest.fn();
    cb.onReachedMaxAttempts(listener);

    cb.error();
    expect(cb.isOpen()).toBe(false);
    expect(mockInnerBreaker.error).toHaveBeenCalledTimes(1);

    cb.error();
    expect(cb.isOpen()).toBe(false);
    expect(mockInnerBreaker.error).toHaveBeenCalledTimes(2);

    cb.error();
    expect(cb.isOpen()).toBe(true);
    expect(mockInnerBreaker.error).toHaveBeenCalledTimes(2); // Should not call inner breaker's error again
    expect(listener).toHaveBeenCalled();
  });

  it('success resets error count and delegates to inner breaker', () => {
    const mockInnerBreaker = createMockInnerBreaker();
    mockInnerBreaker.isOpen.mockReturnValue(false);

    const cb = new MaxAttemptsCircuitBreaker(mockInnerBreaker, 3);

    cb.error();
    cb.error();
    expect(cb.isOpen()).toBe(false);

    cb.success();
    expect(mockInnerBreaker.success).toHaveBeenCalledTimes(1);

    // After success, should be able to handle errors again
    cb.error();
    expect(cb.isOpen()).toBe(false);
    expect(mockInnerBreaker.error).toHaveBeenCalledTimes(3);

    cb.error();
    expect(cb.isOpen()).toBe(false);

    cb.error();
    expect(cb.isOpen()).toBe(true);
  });

  it('delegates onOpen to inner breaker', () => {
    const mockInnerBreaker = createMockInnerBreaker();
    const mockListener = jest.fn();
    const disposable = { dispose: jest.fn() };

    mockInnerBreaker.onOpen.mockReturnValue(disposable as Disposable);

    const cb = new MaxAttemptsCircuitBreaker(mockInnerBreaker, 3);
    const result = cb.onOpen(mockListener);

    expect(mockInnerBreaker.onOpen).toHaveBeenCalledWith(mockListener);
    expect(result).toBe(disposable);
  });

  it('delegates onClose to inner breaker', () => {
    const mockInnerBreaker = createMockInnerBreaker();
    const mockListener = jest.fn();
    const disposable = { dispose: jest.fn() };

    mockInnerBreaker.onClose.mockReturnValue(disposable as Disposable);

    const cb = new MaxAttemptsCircuitBreaker(mockInnerBreaker, 3);
    const result = cb.onClose(mockListener);

    expect(mockInnerBreaker.onClose).toHaveBeenCalledWith(mockListener);
    expect(result).toBe(disposable);
  });

  it('reset resets the attempts counter and calls success on inner breaker', () => {
    const mockInnerBreaker = createMockInnerBreaker();
    mockInnerBreaker.isOpen.mockReturnValue(false);

    const cb = new MaxAttemptsCircuitBreaker(mockInnerBreaker, 2);

    cb.error();
    cb.error();
    expect(cb.isOpen()).toBe(true);

    cb.reset();
    expect(mockInnerBreaker.success).toHaveBeenCalledTimes(1);
    expect(cb.isOpen()).toBe(false);

    // After reset, should be able to handle errors again
    cb.error();
    expect(cb.isOpen()).toBe(false);
  });
});
