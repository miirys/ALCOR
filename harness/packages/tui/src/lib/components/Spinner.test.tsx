import { render } from 'ink-testing-library';
import spinners from 'cli-spinners';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Spinner } from './Spinner';

const CHANGE_INTERVAL_MS = 250;

describe('Spinner', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  const shortSpinner = spinners.dotsCircle;
  const longSpinner = spinners.bouncingBall;

  describe('rendering', () => {
    it('should render with default spinner (dotsCircle)', () => {
      const { lastFrame } = render(<Spinner />);
      const output = lastFrame();

      expect(output).toBe(shortSpinner.frames[0].trim());
    });

    it('should render with bouncingBall spinner when spinner="bouncingBall"', () => {
      const { lastFrame } = render(<Spinner spinner="bouncingBall" />);
      const output = lastFrame();

      expect(output).toBe(longSpinner.frames[0]);
    });

    it('should render text when provided', () => {
      const { lastFrame } = render(<Spinner text="Loading data..." />);
      const output = lastFrame();

      expect(output).toContain('Loading data...');
      expect(output).toContain(shortSpinner.frames[0]);
    });
  });

  describe('animation', () => {
    it('should update frame over time', () => {
      const spinner = <Spinner />;
      const { lastFrame, rerender } = render(spinner);
      lastFrame();

      // Advance time to trigger frame change
      jest.advanceTimersByTime(CHANGE_INTERVAL_MS);
      rerender(spinner);
      const secondFrame = lastFrame();

      // Frames might be the same or different depending on timing,
      // but we should still get a valid render
      expect(secondFrame).toBe(shortSpinner.frames[1]);
    });

    it('should cycle through spinner frames', () => {
      const spinner = <Spinner />;
      const { lastFrame, rerender } = render(spinner);

      // Just verify animation continues without crashing
      for (let i = 1; i < shortSpinner.frames.length * 2; i++) {
        jest.advanceTimersByTime(CHANGE_INTERVAL_MS);
        rerender(spinner);
        const frame = lastFrame();
        expect(frame?.trim()).toBe(shortSpinner.frames[i % shortSpinner.frames.length].trim());
      }

      // The test environment doesn't always trigger re-renders,
      // so we just verify the component keeps working
      expect(lastFrame()).toBeTruthy();
    });
  });

  describe('color behavior', () => {
    it('should render when changeColors={true}', () => {
      const { lastFrame } = render(<Spinner changeColors text="Loading..." />);
      const output = lastFrame();

      expect(output).toContain('Loading...');
      expect(output).toBeTruthy();
    });

    it('should render when changeColors={false}', () => {
      const { lastFrame } = render(<Spinner changeColors={false} text="Loading..." />);
      const output = lastFrame();

      expect(output).toContain('Loading...');
      expect(output).toBeTruthy();
    });
  });
});
