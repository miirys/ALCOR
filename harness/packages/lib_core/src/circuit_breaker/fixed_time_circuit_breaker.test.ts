import { FixedTimeCircuitBreaker } from './fixed_time_circuit_breaker';

jest.useFakeTimers();

describe('FixedTimeCircuitBreaker', () => {
  it('does not open by default', () => {
    const cb = new FixedTimeCircuitBreaker(2);
    expect(cb.isOpen()).toBe(false);
  });

  it('opens after the max number of errors has been reached', () => {
    const cb = new FixedTimeCircuitBreaker(2);
    cb.error();
    expect(cb.isOpen()).toBe(false);
    cb.error();
    expect(cb.isOpen()).toBe(true);
  });

  it('success moves to the CLOSED state', () => {
    const cb = new FixedTimeCircuitBreaker(1);
    cb.error();
    expect(cb.isOpen()).toBe(true);
    cb.success();
    expect(cb.isOpen()).toBe(false);
  });

  it('closes after the breakTimeMs', () => {
    const cb = new FixedTimeCircuitBreaker(1, 1000);
    cb.error();
    expect(cb.isOpen()).toBe(true);
    // after 1001 ms, the break is removed
    jest.advanceTimersByTime(1001);
    expect(cb.isOpen()).toBe(false);
  });

  it('instantly opens if an error comes after expired break', () => {
    const cb = new FixedTimeCircuitBreaker(2, 1000);
    cb.error();
    cb.error();
    // after 1001 ms, the break is removed
    jest.advanceTimersByTime(1001);
    cb.error();
    expect(cb.isOpen()).toBe(true);
  });

  describe('Notify about state changes', () => {
    it('should call the `onOpen` callback when the Circuit Breaker is opening', () => {
      const onOpenCallback = jest.fn();
      const cb = new FixedTimeCircuitBreaker(1);
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
      const cb = new FixedTimeCircuitBreaker(1);
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
