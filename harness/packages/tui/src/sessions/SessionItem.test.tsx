import { render } from 'ink-testing-library';
import { describe, it, expect, beforeEach } from '@jest/globals';
import type { SessionListItem } from '../types';
import { SessionItem } from './SessionItem';

const createSession = (overrides: Partial<SessionListItem> = {}): SessionListItem => ({
  id: 'session-1',
  title: 'My first session',
  status: 'RUNNING',
  lastActivity: '2 hours ago',
  ...overrides,
});

describe('SessionItem', () => {
  describe('when rendering a basic session', () => {
    let output: string | undefined;

    beforeEach(() => {
      const session = createSession();
      const { lastFrame } = render(<SessionItem item={session} isSelected={false} />);
      output = lastFrame();
    });

    it('renders the session title', () => {
      expect(output).toContain('My first session');
    });

    it('renders the metadata with formatted time and id', () => {
      expect(output).toContain('2 hours ago · #session-1');
    });
  });

  describe('when the title contains newlines', () => {
    it('replaces newlines with spaces', () => {
      const session = createSession({ title: 'First line\nSecond line' });
      const { lastFrame } = render(<SessionItem item={session} isSelected={false} />);

      expect(lastFrame()).toContain('First line Second line');
      expect(lastFrame()).not.toContain('First line\n');
    });

    it('replaces carriage return + newline sequences', () => {
      const session = createSession({ title: 'Line one\r\nLine two' });
      const { lastFrame } = render(<SessionItem item={session} isSelected={false} />);

      expect(lastFrame()).toContain('Line one Line two');
    });

    it('replaces consecutive newlines with a single space', () => {
      const session = createSession({ title: 'A\n\n\nB' });
      const { lastFrame } = render(<SessionItem item={session} isSelected={false} />);

      expect(lastFrame()).toContain('A B');
    });
  });

  describe('when lastMessagePreview is present', () => {
    it('renders the preview text', () => {
      const session = createSession({ lastMessagePreview: 'Help me debug this auth issue' });
      const { lastFrame } = render(<SessionItem item={session} isSelected={false} />);

      expect(lastFrame()).toContain('Help me debug this auth issue');
    });
  });

  describe('when lastMessagePreview is absent', () => {
    it('does not render any preview text', () => {
      const session = createSession();
      const { lastFrame } = render(<SessionItem item={session} isSelected={false} />);

      expect(lastFrame()).not.toContain('Help me debug');
    });
  });

  describe('when isSelected is true', () => {
    let output: string | undefined;

    beforeEach(() => {
      const session = createSession();
      const { lastFrame } = render(<SessionItem item={session} isSelected={true} />);
      output = lastFrame();
    });

    it('renders the session title', () => {
      expect(output).toContain('My first session');
    });

    it('renders the metadata', () => {
      expect(output).toContain('2 hours ago · #session-1');
    });
  });

  describe('when isSelected is false', () => {
    let output: string | undefined;

    beforeEach(() => {
      const session = createSession();
      const { lastFrame } = render(<SessionItem item={session} isSelected={false} />);
      output = lastFrame();
    });

    it('renders the session title', () => {
      expect(output).toContain('My first session');
    });

    it('renders the metadata', () => {
      expect(output).toContain('2 hours ago · #session-1');
    });
  });
});
