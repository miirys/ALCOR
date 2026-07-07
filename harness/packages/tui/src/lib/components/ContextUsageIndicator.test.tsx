import { render } from 'ink-testing-library';
import { describe, it, expect } from '@jest/globals';
import type { ContextUsage } from '../../types';
import { ContextUsageIndicator } from './ContextUsageIndicator';

const usage = (totalTokens: number, maxTokens: number): ContextUsage => ({
  totalTokens,
  maxTokens,
});

describe('ContextUsageIndicator', () => {
  describe('when contextUsage is undefined', () => {
    it('renders nothing', () => {
      const { lastFrame } = render(<ContextUsageIndicator />);

      expect(lastFrame()).toBe('');
    });
  });

  describe('when usage is below 50%', () => {
    it('renders nothing', () => {
      const { lastFrame } = render(<ContextUsageIndicator contextUsage={usage(49, 100)} />);

      expect(lastFrame()).toBe('');
    });
  });

  describe('when usage is exactly 50%', () => {
    it('displays the context window percentage', () => {
      const { lastFrame } = render(<ContextUsageIndicator contextUsage={usage(50, 100)} />);

      expect(lastFrame()).toContain('CTX 50%');
    });
  });

  describe('when usage is above 50%', () => {
    it('rounds to the nearest integer percentage', () => {
      const { lastFrame } = render(<ContextUsageIndicator contextUsage={usage(146, 200)} />);

      expect(lastFrame()).toContain('CTX 73%');
    });
  });

  describe('when usage exceeds 100%', () => {
    it('clamps the displayed percentage to 100%', () => {
      const { lastFrame } = render(<ContextUsageIndicator contextUsage={usage(234, 200)} />);

      expect(lastFrame()).toContain('CTX 100%');
    });
  });

  describe('when usage rounds up to exactly 50%', () => {
    it('applies the visibility threshold to the rounded value', () => {
      const { lastFrame } = render(<ContextUsageIndicator contextUsage={usage(99, 200)} />);

      expect(lastFrame()).toContain('CTX 50%');
    });
  });

  describe('when maxTokens is zero', () => {
    it('renders nothing rather than dividing by zero', () => {
      const { lastFrame } = render(<ContextUsageIndicator contextUsage={usage(100, 0)} />);

      expect(lastFrame()).toBe('');
    });
  });

  describe('when values are non-finite', () => {
    it('renders nothing', () => {
      const { lastFrame } = render(<ContextUsageIndicator contextUsage={usage(Number.NaN, 100)} />);

      expect(lastFrame()).toBe('');
    });
  });
});
