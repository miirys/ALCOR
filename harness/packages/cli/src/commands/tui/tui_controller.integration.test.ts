import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  jest,
} from '@jest/globals';
import type { AppState, EnvInfo } from '@gitlab-org/tui';
import { LOG_LEVEL } from '@gitlab-org/logging';
import { http, HttpResponse } from 'msw';
import type { ServiceLocator } from '@gitlab/needle';
import { ExecutorManager } from '@gitlab-org/workflow-executor/node';

import { McpManager } from '@gitlab-org/ai-configuration';
import { server } from '../../mocks/setup';
import type { ParsedCliInput } from '../../parse';
import { GitLabBackendConfigAdapter } from '../../backend/gitlab/gitlab_backend_config_adapter';
import type { GitLabParsedOptions } from '../../backend/gitlab/gitlab_parsed_options';
import { ExitHandler } from '../../utils/exit';
import { initDi } from '../../di';
import { TUIController } from './tui_controller';

describe('TUIController', () => {
  let mockUpdateCallback: jest.MockedFunction<(state: AppState) => void>;
  let controller: TUIController;
  let container: ServiceLocator;
  let exitHandler: ExitHandler;

  beforeAll(() => {
    server.listen();
    process.env.GITLAB_TOKEN = 'test_token';
  });

  afterAll(() => {
    server.close();
    delete process.env.GITLAB_TOKEN;
  });

  beforeEach(async () => {
    jest.useFakeTimers({ advanceTimers: true });
    mockUpdateCallback = jest.fn();
    jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    exitHandler = new ExitHandler();

    const mockCliInput: ParsedCliInput = {
      cwd: process.cwd(),
      logLevel: LOG_LEVEL.DEBUG,
      telemetryEnabled: true,
      gitlabAuthToken: 'test_token',
      gitlabBaseUrl: 'https://gitlab.example.com',
      command: { name: 'tui' },
    } as ParsedCliInput;

    const envInfo: EnvInfo = {
      terminalName: 'test-terminal',
      isKittyProtocolSupported: false,
      duoCliVersion: '1.2.3',
      environment: 'development',
      distribution: 'npm',
      osPlatform: 'linux',
      osVersion: '5',
      theme: 'dark',
    };

    const result = await initDi(
      { logDestination: 'file' },
      mockCliInput,
      '0.0.0-test',
      envInfo,
      exitHandler,
      new GitLabBackendConfigAdapter(),
      {} as GitLabParsedOptions,
    );
    container = result.container;
    controller = container.getRequiredService(TUIController);

    const mcpManager = container.getRequiredService(McpManager);
    jest.spyOn(mcpManager, 'reloadAllServers').mockResolvedValue();
    jest.spyOn(mcpManager, 'waitForAllServersSettled').mockResolvedValue();
    jest.spyOn(mcpManager, 'whenReloadSettled').mockResolvedValue();
  });

  afterEach(async () => {
    await container.getRequiredService(ExecutorManager).disposeAsync();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    server.resetHandlers();
  });

  describe('initialize', () => {
    describe('when initialize is called', () => {
      beforeEach(() => controller.initialize(mockUpdateCallback));

      it('should set initial state without blocking on API requests', () => {
        expect(mockUpdateCallback).toHaveBeenCalledTimes(1);
        const finalCall = mockUpdateCallback.mock.calls[0][0];
        expect(finalCall.elements).toHaveLength(0);
        expect(finalCall.isLoading).toBe(false);
      });

      describe('when lazy init is completed', () => {
        beforeEach(async () => {
          const alreadyResolved = mockUpdateCallback.mock.calls.some(
            (call) => call[0].username !== undefined,
          );
          if (alreadyResolved) return;

          const lazyInitComplete = new Promise<void>((resolve) => {
            mockUpdateCallback.mockImplementation((state) => {
              if (state.username !== undefined) {
                resolve();
              }
            });
          });

          await lazyInitComplete;
        });

        it('should set username in state', () => {
          // Find the call that has the username
          const callWithUsername = mockUpdateCallback.mock.calls.find(
            (call) => call[0].username !== undefined,
          );

          // Verify username was set in state
          expect(callWithUsername).toBeDefined();
          expect(callWithUsername![0].username).toBe('@johndoe');
        });
      });
    });

    describe('when the api service fails to initialize', () => {
      beforeEach(async () => {
        server.use(
          http.get('https://gitlab.example.com/api/v4/personal_access_tokens/self', () =>
            HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
          ),
          http.get('https://gitlab.example.com/oauth/token/info', () =>
            HttpResponse.json({ error: 'invalid_token' }, { status: 401 }),
          ),
        );

        await controller.initialize(mockUpdateCallback);

        const errorStateSet = new Promise<void>((resolve) => {
          mockUpdateCallback.mockImplementation((state) => {
            if (state.elements.some((el) => el.type === 'error')) {
              resolve();
            }
          });
        });

        jest.advanceTimersByTime(100);
        await errorStateSet;
      });

      it('appends the diagnostics report as an error element', () => {
        const lastCall = mockUpdateCallback.mock.calls[mockUpdateCallback.mock.calls.length - 1][0];
        const errorElement = lastCall.elements.find((el) => el.type === 'error');
        expect(errorElement).toBeDefined();
        if (errorElement && errorElement.type === 'error') {
          expect(errorElement.error).toContain('invalid');
        }
      });
    });
  });
});
