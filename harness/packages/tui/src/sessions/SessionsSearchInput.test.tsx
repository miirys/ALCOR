import { render } from 'ink-testing-library';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { SessionListItem, SessionsSearchInputState } from '../types';
import { CLI_INPUT_TYPES } from '../constants';
import { KeyHandlerProvider } from '../lib/key_handler';
import { UnifiedInputProvider } from '../lib/input/unified';
import { SessionsSearchInput, type SessionsCallbacks } from './SessionsSearchInput';

const createSession = (overrides: Partial<SessionListItem> = {}): SessionListItem => ({
  id: 'session-1',
  title: 'My first session',
  status: 'RUNNING',
  lastActivity: '2 hours ago',
  ...overrides,
});

const createInputState = (
  overrides: Partial<SessionsSearchInputState> = {},
): SessionsSearchInputState => ({
  inputType: CLI_INPUT_TYPES.SESSIONS_SEARCH,
  searchQuery: '',
  sessions: [],
  selectedIndex: 0,
  isLoading: false,
  hasNextPage: false,
  ...overrides,
});

const renderComponent = (input: SessionsSearchInputState, callbacks: SessionsCallbacks) => {
  return render(
    <UnifiedInputProvider>
      <KeyHandlerProvider>
        <SessionsSearchInput input={input} callbacks={callbacks} />
      </KeyHandlerProvider>
    </UnifiedInputProvider>,
  );
};

describe('SessionsSearchInput', () => {
  const callbacks = createFakePartial<SessionsCallbacks>({});

  describe('when sessions are available', () => {
    const sessions: SessionListItem[] = [
      createSession({ id: '1', title: 'Debug authentication', lastActivity: '2 hours ago' }),
      createSession({ id: '2', title: 'Fix pipeline config', lastActivity: '1 day ago' }),
    ];

    it('renders the placeholder text in the filter input', () => {
      const input = createInputState({ sessions });

      const { lastFrame } = renderComponent(input, callbacks);

      expect(lastFrame()).toContain('Type to search sessions...');
    });
  });

  describe('when there are no sessions', () => {
    it('shows "No sessions available" message', () => {
      const input = createInputState({ sessions: [] });

      const { lastFrame } = renderComponent(input, callbacks);

      expect(lastFrame()).toContain('No sessions available');
    });
  });

  describe('when search query has no matching results', () => {
    it('shows "No matching sessions found" message', () => {
      const input = createInputState({
        searchQuery: 'nonexistent',
        sessions: [],
      });

      const { lastFrame } = renderComponent(input, callbacks);

      expect(lastFrame()).toContain('No matching sessions found');
    });
  });

  describe('when isLoading is true', () => {
    let output: string | undefined;

    beforeEach(() => {
      const input = createInputState({ isLoading: true });
      const { lastFrame } = renderComponent(input, callbacks);
      output = lastFrame();
    });

    it('shows "Loading sessions..." text', () => {
      expect(output).toContain('Loading sessions...');
    });

    it('does not show empty state', () => {
      expect(output).not.toContain('No sessions available');
    });
  });

  describe('when loading more pages', () => {
    const sessions: SessionListItem[] = [createSession({ id: '1', title: 'First session' })];

    let output: string | undefined;

    beforeEach(() => {
      const input = createInputState({
        sessions,
        hasNextPage: true,
        isLoading: true,
      });
      const { lastFrame } = renderComponent(input, callbacks);
      output = lastFrame();
    });

    it('renders "Loading sessions..." text', () => {
      expect(output).toContain('Loading sessions...');
    });

    it('does not render "Load more sessions..." entry', () => {
      expect(output).not.toContain('Load more sessions...');
    });
  });
});
