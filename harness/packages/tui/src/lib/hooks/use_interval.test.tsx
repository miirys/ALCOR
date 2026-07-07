import { render } from 'ink-testing-library';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import React from 'react';
import { Text } from 'ink';
import { useInterval } from './use_interval';

// Test component that uses the hook
const TestComponent: React.FC<{
  callback: () => void;
  delay: number | null;
}> = ({ callback, delay }) => {
  useInterval(callback, delay);
  return React.createElement(Text, null, 'Testing');
};

describe('useInterval', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('basic functionality', () => {
    it('should call callback at specified interval', () => {
      const callback = jest.fn();
      render(React.createElement(TestComponent, { callback, delay: 100 }));

      expect(callback).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should update callback when it changes', () => {
      const firstCallback = jest.fn();
      const secondCallback = jest.fn();

      const { rerender } = render(
        React.createElement(TestComponent, { callback: firstCallback, delay: 100 }),
      );

      jest.advanceTimersByTime(100);
      expect(firstCallback).toHaveBeenCalledTimes(1);
      expect(secondCallback).not.toHaveBeenCalled();

      // Update the callback
      rerender(React.createElement(TestComponent, { callback: secondCallback, delay: 100 }));

      jest.advanceTimersByTime(100);
      expect(firstCallback).toHaveBeenCalledTimes(1);
      expect(secondCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup', () => {
    it('should clear interval on unmount', () => {
      const callback = jest.fn();
      const { unmount } = render(React.createElement(TestComponent, { callback, delay: 100 }));

      jest.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(1);

      unmount();

      jest.advanceTimersByTime(200);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should clear old interval when delay changes', () => {
      const callback = jest.fn();
      const { rerender } = render(React.createElement(TestComponent, { callback, delay: 100 }));

      jest.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(1);

      // Change delay to 200ms
      rerender(React.createElement(TestComponent, { callback, delay: 200 }));

      // Old interval (100ms) should be cleared
      jest.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(1);

      // New interval (200ms) should fire
      jest.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('null delay handling', () => {
    it('should not set up interval when delay is null', () => {
      const callback = jest.fn();
      render(React.createElement(TestComponent, { callback, delay: null }));

      jest.advanceTimersByTime(1000);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should clear existing interval when delay changes to null', () => {
      const callback = jest.fn();
      const { rerender } = render(React.createElement(TestComponent, { callback, delay: 100 }));

      jest.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(1);

      // Change delay to null
      rerender(React.createElement(TestComponent, { callback, delay: null }));

      jest.advanceTimersByTime(200);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should start interval when delay changes from null to number', () => {
      const callback = jest.fn();
      const { rerender } = render(React.createElement(TestComponent, { callback, delay: null }));

      jest.advanceTimersByTime(200);
      expect(callback).not.toHaveBeenCalled();

      // Change delay from null to 100
      rerender(React.createElement(TestComponent, { callback, delay: 100 }));

      jest.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle callback that throws errors', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Test error');
      });

      // Suppress console.error for this test
      const consoleError = console.error;
      console.error = jest.fn();

      render(React.createElement(TestComponent, { callback: errorCallback, delay: 100 }));

      expect(() => {
        jest.advanceTimersByTime(100);
      }).toThrow('Test error');

      expect(errorCallback).toHaveBeenCalledTimes(1);

      console.error = consoleError;
    });

    it('should handle multiple intervals with different delays', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      render(React.createElement(TestComponent, { callback: callback1, delay: 100 }));
      render(React.createElement(TestComponent, { callback: callback2, delay: 50 }));

      jest.advanceTimersByTime(100);
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(100);
      expect(callback1).toHaveBeenCalledTimes(2);
      expect(callback2).toHaveBeenCalledTimes(4);
    });
  });
});
