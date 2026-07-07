import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { Command } from 'commander';
import type { ServiceProvider } from '@gitlab/needle';
import type { ConfigurationController } from '../config/configuration_controller';
import type { BackendConfigAdapter } from '../../backend/backend_config_adapter';
import type { ExitHandler } from '../../utils/exit';
import type { CredentialProvider as CredentialProviderType } from '../../utils/credential_provider';
import type { RunController as RunControllerType } from './run_controller';

const mockInitDi = jest.fn<typeof import('../../di').initDi>();
jest.unstable_mockModule('../../di', () => ({ initDi: mockInitDi }));

const mockGetHeadlessEnvInfo =
  jest.fn<typeof import('../../utils/environment').getHeadlessEnvInfo>();
jest.unstable_mockModule('../../utils/environment', () => ({
  getHeadlessEnvInfo: mockGetHeadlessEnvInfo,
}));

const { RunCommand } = await import('./run_command');
const { CredentialProvider } = await import('../../utils/credential_provider');

describe('RunCommand', () => {
  let mockAdapter: BackendConfigAdapter<unknown>;
  let mockExitHandler: ExitHandler;

  // The minimum valid raw options the real `parse` needs; `outputFormat` is what
  // drives log-destination routing and is overridden per test.
  const baseOpts: Record<string, unknown> = {
    goal: 'test goal',
    cwd: '/test/cwd',
    logLevel: 'debug',
  };

  const runAction = async (allOpts: Record<string, unknown>) => {
    let actionHandler: (() => Promise<void>) | undefined;

    const node = createFakePartial<Command>({
      addOption: jest.fn<Command['addOption']>(),
      optsWithGlobals: (() => allOpts) as unknown as Command['optsWithGlobals'],
      action: ((handler: () => Promise<void>) => {
        actionHandler = handler;
        return undefined as unknown as Command;
      }) as Command['action'],
    });

    const command = new RunCommand({
      adapter: mockAdapter,
      version: '1.0.0',
      exitHandler: mockExitHandler,
    });
    command.register(node);

    // Guard against a vacuous pass: if register() never wired an action
    // handler, the assertions in each test would otherwise never run.
    expect(actionHandler).toBeDefined();
    await actionHandler!();
  };

  beforeEach(() => {
    mockExitHandler = createFakePartial<ExitHandler>({ exit: jest.fn<ExitHandler['exit']>() });

    mockAdapter = createFakePartial<BackendConfigAdapter<unknown>>({
      registerOptions: jest.fn<BackendConfigAdapter<unknown>['registerOptions']>(),
      parseOptions: jest.fn<BackendConfigAdapter<unknown>['parseOptions']>().mockReturnValue({}),
    });

    mockGetHeadlessEnvInfo.mockResolvedValue(createFakePartial({}));

    const mockCredentialProvider = createFakePartial<CredentialProviderType>({
      getCredentials: jest.fn<CredentialProviderType['getCredentials']>().mockResolvedValue({
        token: 'test-token',
        baseUrl: 'https://example.com',
        source: { type: 'none' },
      }),
    });

    const mockController = createFakePartial<RunControllerType>({
      initialize: jest.fn<RunControllerType['initialize']>().mockResolvedValue(undefined),
      execute: jest.fn<RunControllerType['execute']>().mockResolvedValue(undefined),
    });

    const mockContainer = createFakePartial<ServiceProvider>({
      getRequiredService: jest.fn((token) =>
        token === CredentialProvider ? mockCredentialProvider : mockController,
      ) as ServiceProvider['getRequiredService'],
    });

    const mockConfigurationController = createFakePartial<ConfigurationController>({
      isMissingConfiguration: jest
        .fn<ConfigurationController['isMissingConfiguration']>()
        .mockReturnValue(false),
    });

    mockInitDi.mockResolvedValue({
      container: mockContainer,
      configurationController: mockConfigurationController,
    });
  });

  describe('log destination routing', () => {
    // stdout is reserved for the result in every format, so logs always go to stderr.
    it.each(['json', 'text', undefined])(
      'routes logs to stderr when output format is %s',
      async (outputFormat) => {
        await runAction({ ...baseOpts, ...(outputFormat ? { outputFormat } : {}) });

        expect(mockInitDi).toHaveBeenCalledWith(
          { logDestination: 'stderr' },
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );
      },
    );
  });

  describe('terminal-capability probes', () => {
    // `run` is headless in every output format, so it must use the
    // non-probing env info that emits no query escape sequences.
    it.each(['json', 'text', undefined])(
      'uses headless env info (no terminal probes) when output format is %s',
      async (outputFormat) => {
        await runAction({ ...baseOpts, ...(outputFormat ? { outputFormat } : {}) });

        expect(mockGetHeadlessEnvInfo).toHaveBeenCalled();
      },
    );
  });
});
