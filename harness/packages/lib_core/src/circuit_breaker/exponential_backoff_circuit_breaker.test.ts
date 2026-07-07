import { ExponentialBackoffCircuitBreaker } from './exponential_backoff_circuit_breaker';

jest.useFakeTimers();

describe('ExponentialBackoffCircuitBreaker', () => {
  it('does not open by default', () => {
    const cb = new ExponentialBackoffCircuitBreaker();
    expect(cb.isOpen()).toBe(false);
  });

  it('opens after an error', () => {
    const cb = new ExponentialBackoffCircuitBreaker();
    cb.error();
    expect(cb.isOpen()).toBe(true);
  });

  it('success moves to the CLOSED state', () => {
    const cb = new ExponentialBackoffCircuitBreaker();
    cb.error();
    expect(cb.isOpen()).toBe(true);
    cb.success();
    expect(cb.isOpen()).toBe(false);
  });

  it('closes after the initialBackoffMs time', () => {
    const cb = new ExponentialBackoffCircuitBreaker({ initialBackoffMs: 100 });
    cb.error();
    expect(cb.isOpen()).toBe(true);
    // after 101 ms, the break is removed
    jest.advanceTimersByTime(101);
    expect(cb.isOpen()).toBe(false);
  });

  it('opens for multiplier*initialBackoofTime if an error comes after expired break', () => {
    const cb = new ExponentialBackoffCircuitBreaker({
      initialBackoffMs: 100,
      backoffMultiplier: 2,
    });
    cb.error();
    jest.advanceTimersByTime(101);
    cb.error();
    expect(cb.isOpen()).toBe(true);
    jest.advanceTimersByTime(101);
    expect(cb.isOpen()).toBe(true);
    jest.advanceTimersByTime(101);
    expect(cb.isOpen()).toBe(false);
  });

  it('megaError is like three errors', () => {
    const cb = new ExponentialBackoffCircuitBreaker({
      initialBackoffMs: 100,
      backoffMultiplier: 2,
    });
    cb.megaError();
    // 3 errors = 100*2^(3-1) = 400ms
    jest.advanceTimersByTime(399);
    expect(cb.isOpen()).toBe(true);
    jest.advanceTimersByTime(2);
    expect(cb.isOpen()).toBe(false);
  });

  it('backoff stops at maximum time', () => {
    const cb = new ExponentialBackoffCircuitBreaker({
      initialBackoffMs: 100,
      backoffMultiplier: 10,
      maxBackoffMs: 500,
    });
    cb.error();
    jest.advanceTimersByTime(101);
    expect(cb.isOpen()).toBe(false);

    cb.error();
    jest.advanceTimersByTime(501);
    expect(cb.isOpen()).toBe(false);
  });

  describe('Notify about state changes', () => {
    it('should call the `onOpen` callback when the Circuit Breaker is opening', () => {
      const onOpenCallback = jest.fn();
      const cb = new ExponentialBackoffCircuitBreaker();
      const onOpenSubscription = cb.onOpen(onOpenCallback);
      cb.error();
      expect(cb.isOpen()).toBe(true);
      expect(onOpenCallback).toHaveBeenCalled();
      cb.success();
      expect(cb.isOpen()).toBe(false);
      onOpenSubscription.dispose();
    });

    it('should call the `onClose` callback when the Circuit Breaker is closing', () => {
      const onCloseCallback = jest.fn();
      const cb = new ExponentialBackoffCircuitBreaker();
      const onCloseSubscription = cb.onClose(onCloseCallback);
      cb.error();
      expect(cb.isOpen()).toBe(true);
      expect(onCloseCallback).not.toHaveBeenCalled();
      cb.success();
      expect(cb.isOpen()).toBe(false);
      expect(onCloseCallback).toHaveBeenCalled();
      onCloseSubscription.dispose();
    });
  });
});
