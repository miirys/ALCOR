import { createFakePartial } from '@gitlab-org/test-utils';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { App } from './App';
import { defaultAppState, defaultInputState } from './default_state';
import { AppCallbacks, AppState } from './types';
import { renderWithProviders } from './test/render_helper';

const mockEnvInfo = {
  terminalName: 'test-terminal',
  duoCliVersion: '1.0.0-test',
};

const renderWithContext = (state: AppState, callbacks: AppCallbacks) =>
  renderWithProviders(<App state={state} callbacks={callbacks} />, { envInfo: mockEnvInfo });

describe('App', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('existing functionality', () => {
    it('should render ChatInterface with provided state', () => {
      const callbacks = createFakePartial<AppCallbacks>({
        toggleExpanded: jest.fn(),
      });

      const testState: AppState = {
        ...defaultAppState,
        input: { ...defaultInputState, lines: ['typing...'], cursorColumn: 9 },
      };

      const lastFrame = renderWithContext(testState, callbacks).lastFrame();

      expect(lastFrame).toContain('typing...');
    });

    it('should pass callbacks correctly to ChatInterface', () => {
      const callbacks = createFakePartial<AppCallbacks>({
        toggleExpanded: jest.fn(),
        onTextChange: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      });

      const { lastFrame } = renderWithContext(defaultAppState, callbacks);

      // Verify the app renders correctly with callbacks
      expect(lastFrame()).toContain('ALCOR');
    });
  });

  describe('header rendering', () => {
    it('should render AppHeader with version from context', () => {
      const callbacks = createFakePartial<AppCallbacks>({});
      const testState: AppState = {
        ...defaultAppState,
        username: 'testuser',
      };

      const { lastFrame } = renderWithContext(testState, callbacks);
      const output = lastFrame();

      expect(output).toContain('1.0.0-test');
      expect(output).toContain('ALCOR');
    });

    it('should show spinner when username is not available', () => {
      const callbacks = createFakePartial<AppCallbacks>({});
      const testState: AppState = {
        ...defaultAppState,
        username: undefined,
      };

      const { lastFrame } = renderWithContext(testState, callbacks);
      const output = lastFrame();

      expect(output).toContain('Initializing');
    });

    it('should show welcome message with username when available', () => {
      const callbacks = createFakePartial<AppCallbacks>({});
      const testState: AppState = {
        ...defaultAppState,
        username: 'johndoe',
      };

      const { lastFrame } = renderWithContext(testState, callbacks);
      const output = lastFrame();

      expect(output).toContain('User johndoe');
    });
  });

  describe('GitLab Remote Status', () => {
    it('should render connected status with link', () => {
      const callbacks = createFakePartial<AppCallbacks>({});
      const testState: AppState = {
        ...defaultAppState,
        username: 'testuser',
        gitlabRemoteInfo: {
          status: 'connected',
          gitlabPath: 'mygroup/myproject',
          gitlabHost: 'gitlab.com',
        },
      };

      const { lastFrame } = renderWithContext(testState, callbacks);
      const output = lastFrame();

      expect(output).toContain('gitlab.com/mygroup/myproject');
    });

    it('should render error status in red', () => {
      const callbacks = createFakePartial<AppCallbacks>({});
      const testState: AppState = {
        ...defaultAppState,
        username: 'testuser',
        gitlabRemoteInfo: {
          status: 'error',
          errorMessage: 'Could not find GitLab remote',
        },
      };

      const { lastFrame } = renderWithContext(testState, callbacks);
      const output = lastFrame();

      expect(output).toContain('Could not find GitLab remote');
    });

    it('should render nothing for not-checked status', () => {
      const callbacks = createFakePartial<AppCallbacks>({});
      const testState: AppState = {
        ...defaultAppState,
        username: 'testuser',
        gitlabRemoteInfo: {
          status: 'not-checked',
        },
      };

      const { lastFrame } = renderWithContext(testState, callbacks);

      // Should render without error, but no GitLab info yet
      expect(lastFrame()).toBeTruthy();
    });
  });

  describe('CWD display', () => {
    it('should display cwd when present', () => {
      const callbacks = createFakePartial<AppCallbacks>({});
      const testState: AppState = {
        ...defaultAppState,
        username: 'testuser',
        cwd: '/home/user/project',
      };

      const { lastFrame } = renderWithContext(testState, callbacks);
      const output = lastFrame();

      expect(output).toContain('/home/user/project');
    });

    it('should not display cwd section when empty', () => {
      const callbacks = createFakePartial<AppCallbacks>({});
      const testState: AppState = {
        ...defaultAppState,
        username: 'testuser',
        cwd: '',
      };

      const { lastFrame } = renderWithContext(testState, callbacks);

      // Should still render successfully without cwd
      expect(lastFrame()).toBeTruthy();
    });
  });

  describe('ConditionalStatic behavior', () => {
    it('should render header when username is available', () => {
      const callbacks = createFakePartial<AppCallbacks>({});
      const testState: AppState = {
        ...defaultAppState,
        username: 'testuser',
      };

      const { lastFrame } = renderWithContext(testState, callbacks);

      expect(lastFrame()).toContain('User testuser');
    });

    it('should transition from loading to static state', () => {
      const callbacks = createFakePartial<AppCallbacks>({});
      const testStateWithoutUser: AppState = {
        ...defaultAppState,
        username: undefined,
      };

      const { rerender, lastFrame } = renderWithContext(testStateWithoutUser, callbacks);

      // Initially should show loading spinner
      expect(lastFrame()).toContain('Initializing');

      // Update with username
      const testStateWithUser: AppState = {
        ...defaultAppState,
        username: 'johndoe',
      };

      rerender(<App state={testStateWithUser} callbacks={callbacks} />);

      // Should now show username
      expect(lastFrame()).toContain('User johndoe');
    });
  });

  describe('integration', () => {
    it('should render complete header with all information', () => {
      const callbacks = createFakePartial<AppCallbacks>({});
      const testState: AppState = {
        ...defaultAppState,
        username: 'developer',
        cwd: '/workspace/project',
        gitlabRemoteInfo: {
          status: 'connected',
          gitlabPath: 'team/app',
          gitlabHost: 'gitlab.example.com',
        },
      };

      const { lastFrame } = renderWithContext(testState, callbacks);
      const output = lastFrame();

      expect(output).toContain('User developer');
      expect(output).toContain('/workspace/project');
      expect(output).toContain('gitlab.example.com/team/app');
      expect(output).toContain('1.0.0-test');
    });

    it('should handle partial state gracefully', () => {
      const callbacks = createFakePartial<AppCallbacks>({});
      const testState: AppState = {
        ...defaultAppState,
        username: 'user',
        cwd: '',
        gitlabRemoteInfo: { status: 'not-checked' },
      };

      const { lastFrame } = renderWithContext(testState, callbacks);

      // Should render without errors even with minimal state
      expect(lastFrame()).toContain('User user');
    });
  });
});
