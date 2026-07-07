import { createFakePartial } from '@gitlab-org/test-utils';
import { describe, it, expect, jest } from '@jest/globals';
import { ChatInterface, getAgentColor, truncateTitle } from './ChatInterface';
import { defaultAppState } from './default_state';
import { AppCallbacks, AppState, ChoiceInputState, UpdateCheckResult } from './types';
import { CLI_INPUT_TYPES } from './constants';
import { renderWithProviders } from './test/render_helper';

const renderChatInterface = (state: AppState, callbacks: AppCallbacks) =>
  renderWithProviders(<ChatInterface state={state} callbacks={callbacks} />);

const createDefaultCallbacks = () =>
  createFakePartial<AppCallbacks>({
    toggleExpanded: jest.fn(),
    onTextChange: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    onOpenHistorySearch: jest.fn(),
    onCancelStream: jest.fn(),
    onForceStop: jest.fn(),
    onExit: jest.fn(),
    onCycleAgent: jest.fn(),
    onCancelQueuedPrompt: jest.fn(),
  });

describe('ChatInterface', () => {
  const callbacks = createDefaultCallbacks();

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should render both message list and input components', () => {
    const state = {
      ...defaultAppState,
      elements: [
        {
          id: '1',
          type: 'message' as const,
          role: 'user' as const,
          content: 'Hello',
          timestamp: Date.now(),
          isComplete: true,
        },
      ],
    };

    const { lastFrame } = renderChatInterface(state, callbacks);

    expect(lastFrame()).toContain('Hello');
  });

  it('should render input component', () => {
    const { lastFrame } = renderChatInterface(defaultAppState, callbacks);

    expect(lastFrame()).toContain('Ask ALCOR anything');
  });

  it('should show loading indicator when isLoading is true', () => {
    const state = {
      ...defaultAppState,
      isLoading: true,
    };

    const { lastFrame } = renderChatInterface(state, callbacks);
    const output = lastFrame();

    expect(output).toContain('Thinking');
    expect(output).toContain('Thinking');
  });

  it('should show the auto mode indicator when permissionMode is auto', () => {
    const state: AppState = {
      ...defaultAppState,
      permissionMode: 'auto',
    };

    const { lastFrame } = renderChatInterface(state, callbacks);

    expect(lastFrame()).toContain('≫ AUTO');
  });

  it('should not show the auto mode indicator in default permission mode', () => {
    const { lastFrame } = renderChatInterface(defaultAppState, callbacks);

    expect(lastFrame()).not.toContain('≫ AUTO');
  });

  describe('queued prompt indicator', () => {
    it('renders the queued prompt preview when a prompt is queued', () => {
      const state: AppState = {
        ...defaultAppState,
        isLoading: true,
        queuedPrompt: { prompt: 'follow up question', agentMode: 'build' },
      };

      const { lastFrame } = renderChatInterface(state, callbacks);

      expect(lastFrame()).toContain('follow up question');
    });

    it('does not render a preview when no prompt is queued', () => {
      const withQueue = renderChatInterface(
        {
          ...defaultAppState,
          isLoading: true,
          queuedPrompt: { prompt: 'queued-sentinel-text', agentMode: 'build' },
        },
        callbacks,
      );
      expect(withQueue.lastFrame()).toContain('queued-sentinel-text');

      const withoutQueue = renderChatInterface(
        { ...defaultAppState, isLoading: true, queuedPrompt: undefined },
        callbacks,
      );
      expect(withoutQueue.lastFrame()).not.toContain('queued-sentinel-text');
    });

    it('collapses a multi-line queued prompt to its first line with a line-count suffix', () => {
      const state: AppState = {
        ...defaultAppState,
        isLoading: true,
        queuedPrompt: { prompt: 'first line\nsecond line\nthird line', agentMode: 'build' },
      };

      const output = renderChatInterface(state, callbacks).lastFrame() ?? '';

      expect(output).toContain('first line');
      expect(output).not.toContain('second line');
      // The +N suffix tells the user the queued draft is more than one line.
      expect(output).toContain('+2');
    });

    it('renders an Esc-to-cancel hint inline with the queued indicator', () => {
      const state: AppState = {
        ...defaultAppState,
        isLoading: true,
        queuedPrompt: { prompt: 'follow up', agentMode: 'build' },
      };

      expect(renderChatInterface(state, callbacks).lastFrame()).toContain('Esc to cancel');
    });

    it('hides the Esc-to-cancel hint when a non-text input owns the screen', () => {
      // While a tool-approval choice is active, Esc is owned by the choice input
      // and does not clear the queue, so the hint would mislead. The preview
      // still shows so the user can see what is queued.
      const state: AppState = {
        ...defaultAppState,
        input: createFakePartial<ChoiceInputState>({
          inputType: CLI_INPUT_TYPES.CHOICE,
          choiceOptions: [{ label: 'Approve', value: 'approve' }],
        }),
        queuedPrompt: { prompt: 'queued while approving', agentMode: 'build' },
      };

      const output = renderChatInterface(state, callbacks).lastFrame() ?? '';
      expect(output).toContain('queued while approving');
      expect(output).not.toContain('Esc to cancel');
    });

    it('hides the status-bar stream-cancel hint while a prompt is queued', async () => {
      const state: AppState = {
        ...defaultAppState,
        isLoading: true,
        queuedPrompt: { prompt: 'queued message', agentMode: 'build' },
      };
      const { sendInput, lastFrame } = renderChatInterface(state, callbacks);

      // Esc routes to queue.cancel and never enters the stream-cancel flow,
      // so the cancelling hint must never appear.
      sendInput('', { escape: true });
      await jest.advanceTimersByTimeAsync(0);
      expect(lastFrame()).not.toContain('force stop');
    });

    it('calls onCancelQueuedPrompt when Esc is pressed while a prompt is queued', async () => {
      const state: AppState = {
        ...defaultAppState,
        isLoading: true,
        queuedPrompt: { prompt: 'queued message', agentMode: 'build' },
      };
      const { sendInput } = renderChatInterface(state, callbacks);

      sendInput('', { escape: true });
      await jest.advanceTimersByTimeAsync(0);

      expect(callbacks.onCancelQueuedPrompt).toHaveBeenCalledTimes(1);
      // Esc clears the queue first; it must not start the stream-cancel flow.
      expect(callbacks.onCancelStream).not.toHaveBeenCalled();
    });

    it('re-arms the stream cancel after the queue is cleared', async () => {
      const loadingState: AppState = { ...defaultAppState, isLoading: true };
      const queuedState: AppState = {
        ...loadingState,
        queuedPrompt: { prompt: 'queued', agentMode: 'build' },
      };
      const { sendInput, rerender, lastFrame } = renderChatInterface(queuedState, callbacks);

      // While queued, the stream cancel hint is suppressed entirely.
      expect(lastFrame()).not.toContain('force stop');

      // User cancels the queue: clear it via a rerender (the controller would do
      // this in response to onCancelQueuedPrompt).
      rerender(<ChatInterface state={loadingState} callbacks={callbacks} />);
      await jest.advanceTimersByTimeAsync(0);

      // Now Esc immediately cancels the stream and shows the cancelling hint.
      sendInput('', { escape: true });
      await jest.advanceTimersByTimeAsync(0);
      expect(callbacks.onCancelStream).toHaveBeenCalledTimes(1);
      expect(lastFrame()).toContain('force stop');
    });

    it('clears the indicator when queuedPrompt transitions to undefined', async () => {
      const loadingState: AppState = { ...defaultAppState, isLoading: true };
      const { rerender, lastFrame } = renderChatInterface(
        { ...loadingState, queuedPrompt: { prompt: 'queued-sentinel-text', agentMode: 'build' } },
        callbacks,
      );
      expect(lastFrame()).toContain('queued-sentinel-text');

      rerender(<ChatInterface state={loadingState} callbacks={callbacks} />);
      await jest.advanceTimersByTimeAsync(0);

      expect(lastFrame()).not.toContain('queued-sentinel-text');
      expect(lastFrame()).not.toContain('Up next');
    });

    it('resets the stream cancelling state when a prompt becomes queued mid-cancel', async () => {
      const loadingState: AppState = { ...defaultAppState, isLoading: true };
      const { sendInput, rerender, lastFrame } = renderChatInterface(loadingState, callbacks);

      // Step 1: first Esc immediately cancels and enters the cancelling state.
      sendInput('', { escape: true });
      await jest.advanceTimersByTimeAsync(0);
      expect(lastFrame()).toContain('force stop');

      // Step 2: a prompt is queued, so Esc now means "cancel queue". The
      // cancelling state must reset so a stale hint can't linger.
      rerender(
        <ChatInterface
          state={{
            ...loadingState,
            queuedPrompt: { prompt: 'queued mid-confirm', agentMode: 'build' },
          }}
          callbacks={callbacks}
        />,
      );
      await jest.advanceTimersByTimeAsync(0);
      expect(lastFrame()).not.toContain('force stop');
    });
  });

  describe('ESC - cancel / force-stop (no confirm)', () => {
    const loadingState: AppState = {
      ...defaultAppState,
      isLoading: true,
    };

    it('fires onCancelStream exactly once on the first ESC during a stream', async () => {
      const { sendInput } = renderChatInterface(loadingState, callbacks);

      sendInput('', { escape: true });
      await jest.advanceTimersByTimeAsync(0);

      expect(callbacks.onCancelStream).toHaveBeenCalledTimes(1);
      expect(callbacks.onForceStop).not.toHaveBeenCalled();
    });

    it('fires onForceStop exactly once on a second ESC within 1500ms', async () => {
      const { sendInput } = renderChatInterface(loadingState, callbacks);

      sendInput('', { escape: true });
      await jest.advanceTimersByTimeAsync(0);
      sendInput('', { escape: true }); // within the force-stop window
      await jest.advanceTimersByTimeAsync(0);

      expect(callbacks.onCancelStream).toHaveBeenCalledTimes(1);
      expect(callbacks.onForceStop).toHaveBeenCalledTimes(1);
    });

    it('does not force-stop on a second ESC after the 1500ms window', async () => {
      const { sendInput } = renderChatInterface(loadingState, callbacks);

      sendInput('', { escape: true });
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(1600); // past the window (still cancelling)
      sendInput('', { escape: true });
      await jest.advanceTimersByTimeAsync(0);

      expect(callbacks.onCancelStream).toHaveBeenCalledTimes(1);
      expect(callbacks.onForceStop).not.toHaveBeenCalled();
    });

    it('does not fire cancel or force-stop on ESC when no stream is active', async () => {
      const { sendInput } = renderChatInterface(defaultAppState, callbacks);

      sendInput('', { escape: true });
      await jest.advanceTimersByTimeAsync(0);
      sendInput('', { escape: true });
      await jest.advanceTimersByTimeAsync(0);

      expect(callbacks.onCancelStream).not.toHaveBeenCalled();
      expect(callbacks.onForceStop).not.toHaveBeenCalled();
    });

    it('shows the cancelling hint after the first ESC and force-stop affordance', async () => {
      const { sendInput, lastFrame } = renderChatInterface(loadingState, callbacks);

      sendInput('', { escape: true });
      await jest.advanceTimersByTimeAsync(0);

      expect(lastFrame()).toContain('Cancelling');
      expect(lastFrame()).toContain('force stop');
    });

    it('shows Stopped. after the stream settles, then does not re-fire on ESC', async () => {
      const { sendInput, lastFrame, rerender } = renderChatInterface(loadingState, callbacks);

      sendInput('', { escape: true });
      await jest.advanceTimersByTimeAsync(0);
      expect(callbacks.onCancelStream).toHaveBeenCalledTimes(1);

      // Backend settles the cancel: the stream stops.
      rerender(
        <ChatInterface state={{ ...loadingState, isLoading: false }} callbacks={callbacks} />,
      );
      await jest.advanceTimersByTimeAsync(0);
      expect(lastFrame()).toContain('Stopped');

      // ESC after settle must not re-fire cancel or force-stop.
      sendInput('', { escape: true });
      await jest.advanceTimersByTimeAsync(0);
      expect(callbacks.onCancelStream).toHaveBeenCalledTimes(1);
      expect(callbacks.onForceStop).not.toHaveBeenCalled();
    });
  });

  describe('Ctrl+C - exit', () => {
    it('should call onExit when Ctrl+C is pressed', () => {
      const { sendInput } = renderChatInterface(defaultAppState, callbacks);

      sendInput('c', { ctrl: true });

      expect(callbacks.onExit).toHaveBeenCalledTimes(1);
    });

    it('should call onExit when Ctrl+C is pressed while loading', () => {
      const state = {
        ...defaultAppState,
        isLoading: true,
      };
      const { sendInput } = renderChatInterface(state, callbacks);

      sendInput('c', { ctrl: true });

      expect(callbacks.onExit).toHaveBeenCalledTimes(1);
    });

    it('should stop event propagation after handling Ctrl+C', () => {
      const { sendInput } = renderChatInterface(defaultAppState, callbacks);

      sendInput('c', { ctrl: true });

      expect(callbacks.onExit).toHaveBeenCalledTimes(1);
    });
  });

  describe('agent mode indicator', () => {
    describe('when multiple agents are available', () => {
      it('should render the selected agent name', () => {
        const { lastFrame } = renderChatInterface(defaultAppState, callbacks);
        const output = lastFrame();

        expect(output).toContain('BUILD');
        expect(output).toContain('Tab');
      });
    });

    describe('when only one agent is available', () => {
      it('should not render agent mode indicator', () => {
        const state: AppState = {
          ...defaultAppState,
          availableAgents: ['build'],
        };

        const { lastFrame } = renderChatInterface(state, callbacks);

        expect(lastFrame()).not.toContain('Tab');
      });
    });
  });

  describe('session title', () => {
    it('does not show a title on the input bar when there are no messages', () => {
      const { lastFrame } = renderChatInterface(defaultAppState, callbacks);
      expect(lastFrame()).not.toContain('Session:');
    });

    it('shows the first user message as the input bar title when messages are present', () => {
      const state: AppState = {
        ...defaultAppState,
        elements: [
          {
            id: '1',
            type: 'message' as const,
            role: 'user' as const,
            content: 'unique-title-string',
            timestamp: Date.now(),
            isComplete: true,
          },
        ],
      };
      const { lastFrame } = renderChatInterface(state, callbacks);
      expect(lastFrame()).toContain('unique-title-string');
    });

    describe('terminal tab title (OSC sequence)', () => {
      let writeSpy: ReturnType<typeof jest.spyOn>;

      beforeEach(() => {
        Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });
        writeSpy = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
      });

      afterEach(() => {
        Object.defineProperty(process.stderr, 'isTTY', { value: undefined, configurable: true });
        writeSpy.mockRestore();
      });

      const stateWithMessage = (content: string): AppState => ({
        ...defaultAppState,
        elements: [
          {
            id: '1',
            type: 'message' as const,
            role: 'user' as const,
            content,
            timestamp: Date.now(),
            isComplete: true,
          },
        ],
      });

      it('writes the OSC title sequence when a session title is present', () => {
        renderChatInterface(stateWithMessage('Fix the bug'), callbacks);
        expect(writeSpy).toHaveBeenCalledWith('\x1b]0;Fix the bug\x07');
      });

      it('clears the title on unmount', () => {
        const { unmount } = renderChatInterface(stateWithMessage('Fix the bug'), callbacks);
        writeSpy.mockClear();
        unmount();
        expect(writeSpy).toHaveBeenCalledWith('\x1b]0;\x07');
      });

      it('does not write when there are no messages', () => {
        renderChatInterface(defaultAppState, callbacks);
        expect(writeSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('truncateTitle', () => {
    it('returns the full first line when under 60 characters', () => {
      expect(truncateTitle('short title')).toBe('short title');
    });

    it('returns exactly 60 characters without truncation', () => {
      const exact = 'a'.repeat(60);
      expect(truncateTitle(exact)).toBe(exact);
      expect(truncateTitle(exact)).toHaveLength(60);
    });

    it('truncates to exactly 60 characters total including ellipsis', () => {
      const long = 'b'.repeat(80);
      expect(truncateTitle(long)).toBe(`${'b'.repeat(59)}…`);
      expect(truncateTitle(long)).toHaveLength(60);
    });

    it('uses only the first line of multi-line content', () => {
      expect(truncateTitle('first line\nsecond line')).toBe('first line');
    });

    it('strips ESC and BEL to prevent OSC sequence injection', () => {
      expect(truncateTitle('hello\x1bworld\x07')).toBe('helloworld');
    });

    it('handles empty content', () => {
      expect(truncateTitle('')).toBe('');
    });
  });

  describe('getAgentColor', () => {
    it('returns silver for build mode', () => {
      expect(getAgentColor('build')).toBe('#e8e8ee');
    });

    it('returns amber for plan mode', () => {
      expect(getAgentColor('plan')).toBe('#e0af68');
    });
  });

  describe('Tab - cycle agent', () => {
    it('should call onCycleAgent when Tab is pressed', () => {
      const { sendInput } = renderChatInterface(defaultAppState, callbacks);

      sendInput('', { tab: true });

      expect(callbacks.onCycleAgent).toHaveBeenCalledTimes(1);
    });

    describe('when Tab key is released (Kitty protocol)', () => {
      it('should not call onCycleAgent on release event', () => {
        const { sendInput } = renderChatInterface(defaultAppState, callbacks);

        // Send Tab release event using Kitty protocol format
        // \x1b[9;1:3u = Tab key, no modifiers, release event (event-type=3)
        sendInput('', { tab: true }, '\x1b[9;1:3u');

        expect(callbacks.onCycleAgent).not.toHaveBeenCalled();
      });

      it('should only cycle once when both press and release events are sent', () => {
        const { sendInput } = renderChatInterface(defaultAppState, callbacks);

        // Send Tab press event (normal tab)
        sendInput('', { tab: true });
        // Send Tab release event using Kitty protocol
        sendInput('', { tab: true }, '1b5b393b313a3375');

        // Should only be called once (on press, not on release)
        expect(callbacks.onCycleAgent).toHaveBeenCalledTimes(1);
      });
    });

    describe('when loading', () => {
      it('should not call onCycleAgent', () => {
        const state: AppState = {
          ...defaultAppState,
          isLoading: true,
        };
        const { sendInput } = renderChatInterface(state, callbacks);

        sendInput('', { tab: true });

        expect(callbacks.onCycleAgent).not.toHaveBeenCalled();
      });
    });

    describe('when input is CHOICE type', () => {
      it('should not call onCycleAgent', () => {
        const state: AppState = {
          ...defaultAppState,
          input: createFakePartial<ChoiceInputState>({
            inputType: CLI_INPUT_TYPES.CHOICE,
            choiceOptions: [{ label: 'Option 1', value: 'opt1' }],
            selectedChoiceIndex: 0,
          }),
        };
        const { sendInput } = renderChatInterface(state, callbacks);

        sendInput('', { tab: true });

        expect(callbacks.onCycleAgent).not.toHaveBeenCalled();
      });
    });
  });

  describe('when terminal is resizing', () => {
    const initializedState: AppState = {
      ...defaultAppState,
      username: 'testuser',
      gitlabRemoteInfo: {
        status: 'connected',
        gitlabPath: 'group/project',
        gitlabHost: 'gitlab.com',
      },
      updateCheckResult: createFakePartial<UpdateCheckResult>({
        type: 'up-to-date',
      }),
      elements: [
        {
          id: '1',
          type: 'message' as const,
          role: 'user' as const,
          content: 'Hello',
          timestamp: Date.now(),
          isComplete: true,
        },
        {
          id: '2',
          type: 'message' as const,
          role: 'assistant' as const,
          content: 'Hi there',
          timestamp: Date.now(),
          isComplete: true,
        },
      ],
    };

    it('keeps all elements visible during and after resize', async () => {
      const { lastFrame, stdout } = renderChatInterface(initializedState, callbacks);

      stdout.emit('resize');
      await jest.advanceTimersByTimeAsync(0);
      expect(lastFrame()).toContain('Hello');
      expect(lastFrame()).toContain('Hi there');

      await jest.advanceTimersByTimeAsync(150);
      expect(lastFrame()).toContain('Hello');
      expect(lastFrame()).toContain('Hi there');
    });
  });
});
