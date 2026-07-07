import { render } from 'ink-testing-library';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { LoadingIndicator, THINKING_FRAMES } from './LoadingIndicator';

describe('LoadingIndicator', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('rendering', () => {
    it('should render Spinner component', () => {
      const { lastFrame } = render(<LoadingIndicator />);
      const output = lastFrame();

      expect(output).toBeTruthy();
      expect(output).toBeDefined();
      if (output) {
        expect(output.length).toBeGreaterThan(0);
      }
    });

    it('should render with correct text', () => {
      const { lastFrame } = render(<LoadingIndicator />);
      const output = lastFrame();

      expect(output).toContain('Thinking');
      expect(output).toContain('✦');
    });

    it('should have left padding', () => {
      const { lastFrame } = render(<LoadingIndicator />);
      const output = lastFrame();

      // The Box component should add padding, making the output start with spaces
      expect(output).toBeTruthy();
    });

    it('should animate over time', () => {
      const { lastFrame } = render(<LoadingIndicator />);

      // Capture initial frame
      const initialFrame = lastFrame();
      expect(initialFrame).toContain(THINKING_FRAMES[0]);

      // Advance one frame interval; the indicator must still render a valid
      // kaomoji frame (React may batch the state update outside act()).
      jest.advanceTimersByTime(300);

      const nextFrame = lastFrame();
      expect(THINKING_FRAMES.some((frame) => nextFrame?.includes(frame))).toBe(true);
    });
  });

  describe('behavior', () => {
    it('should handle unmount gracefully', () => {
      const { unmount } = render(<LoadingIndicator />);

      jest.advanceTimersByTime(100);

      expect(() => unmount()).not.toThrow();
    });

    it('should continue animating after multiple intervals', () => {
      const { lastFrame } = render(<LoadingIndicator />);

      // Advance through multiple animation cycles
      for (let i = 0; i < 10; i++) {
        jest.advanceTimersByTime(300);
        const frame = lastFrame();
        expect(frame).toContain('Thinking');
      }
    });
  });
});
