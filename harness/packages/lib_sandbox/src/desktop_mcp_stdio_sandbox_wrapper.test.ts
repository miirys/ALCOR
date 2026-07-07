import { TestLogger } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import { SandboxManager } from '@anthropic-ai/sandbox-runtime';
import { createFakePartial } from '@gitlab-org/test-utils';
import {
  SandboxAvailabilityService,
  SandboxAvailabilityStatus,
} from './sandbox_availability_service';
import { SandboxConfigService } from './sandbox_config_service';
import { SandboxConfig, McpServerSandboxOverrides } from './sandbox_config_types';
import { DesktopMcpStdioSandboxWrapper } from './desktop_mcp_stdio_sandbox_wrapper';
import { SandboxUnavailableError } from './errors';

jest.mock('@anthropic-ai/sandbox-runtime', () => ({
  SandboxManager: {
    initialize: jest.fn(),
    wrapWithSandbox: jest
      .fn()
      .mockResolvedValue('/path/to/srt run --sandbox-flags -- npx -y server'),
  },
}));

const AVAILABLE_STATUS: SandboxAvailabilityStatus = {
  available: true,
  platform: 'macos',
  provider: 'srt',
  providerVersion: '0.0.39',
};

const UNAVAILABLE_STATUS: SandboxAvailabilityStatus = {
  available: false,
  platform: 'windows',
  reason: 'unsupported_platform',
  missingDependencies: [],
};

const BASE_CONFIG: SandboxConfig = {
  provider: 'anthropic-sandbox-runtime',
  filesystem: {
    allowRead: ['/workspace', '/tmp/'],
    denyRead: ['~/.ssh/'],
    allowWrite: ['/workspace', '/tmp'],
    denyWrite: ['.git/hooks/'],
  },
  network: {
    allowedDomains: ['gitlab.com'],
  },
};

describe('DesktopMcpStdioSandboxWrapper', () => {
  let logger: TestLogger;
  let mockAvailability: SandboxAvailabilityService;
  let mockSandboxConfigService: SandboxConfigService;
  let mockConfigService: ConfigService;

  const defaultParams = {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/home'],
    env: { NODE_ENV: 'production' },
  };

  beforeEach(() => {
    logger = new TestLogger();
    mockAvailability = createFakePartial<SandboxAvailabilityService>({
      getStatus: jest.fn().mockReturnValue(AVAILABLE_STATUS),
    });
    mockSandboxConfigService = createFakePartial<SandboxConfigService>({
      getMcpServerConfig: jest.fn().mockReturnValue(BASE_CONFIG),
    });
    mockConfigService = createFakePartial<ConfigService>({
      get: jest.fn().mockImplementation((key?: string) => {
        if (key === 'duo.sandbox.enabled') return true;
        return undefined;
      }),
    });
  });

  function createWrapper(): DesktopMcpStdioSandboxWrapper {
    return new DesktopMcpStdioSandboxWrapper(
      mockAvailability,
      mockSandboxConfigService,
      mockConfigService,
      logger,
    );
  }

  describe('when srt is available', () => {
    it('wraps the command using SandboxManager', async () => {
      const wrapper = createWrapper();
      const result = await wrapper.transform('test-server', defaultParams, '/workspace');

      expect(result.command).toBe('/bin/sh');
      expect(result.args[0]).toBe('-c');
      expect(result.args[1]).toContain('srt');
    });

    it('preserves the original env', async () => {
      const wrapper = createWrapper();
      const result = await wrapper.transform('test-server', defaultParams, '/workspace');

      expect(result.env).toEqual({ NODE_ENV: 'production' });
    });

    it('initializes SandboxManager with SandboxRuntimeConfig', async () => {
      const wrapper = createWrapper();
      await wrapper.transform('test-server', defaultParams, '/workspace');

      expect(SandboxManager.initialize).toHaveBeenCalledWith(
        {
          network: {
            allowedDomains: ['gitlab.com'],
            deniedDomains: [],
          },
          filesystem: {
            allowRead: ['/workspace', '/tmp/'],
            denyRead: ['~/.ssh/'],
            allowWrite: ['/workspace', '/tmp'],
            denyWrite: ['.git/hooks/'],
          },
        },
        undefined,
        true,
      );
    });

    it('passes the original command and per-server config to wrapWithSandbox', async () => {
      const wrapper = createWrapper();
      await wrapper.transform('test-server', defaultParams, '/workspace');

      expect(SandboxManager.wrapWithSandbox).toHaveBeenCalledWith(
        "'npx' '-y' '@modelcontextprotocol/server-filesystem' '/home'",
        undefined,
        expect.objectContaining({
          filesystem: expect.objectContaining({
            denyRead: ['~/.ssh/'],
            allowWrite: ['/workspace', '/tmp'],
          }),
        }),
      );
    });

    it('shell-quotes command tokens containing spaces and parens', async () => {
      const wrapper = createWrapper();
      // Mimics IDE-host execPath shapes like VS Code's
      // "/Applications/Visual Studio Code.app/.../Code Helper (Plugin)".
      const paramsWithMetacharacters = {
        command: '/Applications/Foo Bar.app/Contents/Helper (Plugin)',
        args: ['--flag', "value with 'quote'"],
        env: { NODE_ENV: 'production' },
      };

      await wrapper.transform('test-server', paramsWithMetacharacters, '/workspace');

      expect(SandboxManager.wrapWithSandbox).toHaveBeenCalledWith(
        "'/Applications/Foo Bar.app/Contents/Helper (Plugin)' '--flag' 'value with '\\''quote'\\'''",
        undefined,
        expect.anything(),
      );
    });

    it('passes sandbox overrides to the config service', async () => {
      const overrides: McpServerSandboxOverrides = {
        allowedDomains: ['extra.com'],
        allowWrite: ['/extra'],
      };

      const wrapper = createWrapper();
      await wrapper.transform('test-server', defaultParams, '/workspace', overrides);

      expect(mockSandboxConfigService.getMcpServerConfig).toHaveBeenCalledWith(
        '/workspace',
        'test-server',
        overrides,
      );
    });
  });

  describe('when duo.sandbox.enabled is false', () => {
    beforeEach(() => {
      (mockConfigService.get as jest.Mock).mockReturnValue(false);
    });

    it('returns original params without wrapping', async () => {
      const wrapper = createWrapper();
      const result = await wrapper.transform('test-server', defaultParams, '/workspace');

      expect(result).toBe(defaultParams);
    });

    it('ignores per-server sandboxEnabled: true', async () => {
      const wrapper = createWrapper();
      const result = await wrapper.transform('test-server', defaultParams, '/workspace', {
        sandboxEnabled: true,
      });

      expect(result).toBe(defaultParams);
    });
  });

  describe('when per-server sandboxEnabled is false', () => {
    it('returns original params without wrapping', async () => {
      const wrapper = createWrapper();
      const result = await wrapper.transform('test-server', defaultParams, '/workspace', {
        sandboxEnabled: false,
      });

      expect(result).toBe(defaultParams);
    });
  });

  describe('when srt is unavailable', () => {
    beforeEach(() => {
      jest.mocked(mockAvailability.getStatus).mockReturnValue(UNAVAILABLE_STATUS);
    });

    it('throws SandboxUnavailableError with an actionable message', async () => {
      const wrapper = createWrapper();

      await expect(wrapper.transform('test-server', defaultParams, '/workspace')).rejects.toThrow(
        SandboxUnavailableError,
      );
      await expect(wrapper.transform('test-server', defaultParams, '/workspace')).rejects.toThrow(
        'Sandbox is enabled but sandbox provider is not available',
      );
    });

    it('keeps the install-or-disable hint in the message and propagates the reason', async () => {
      const wrapper = createWrapper();

      try {
        await wrapper.transform('test-server', defaultParams, '/workspace');
        throw new Error('expected transform to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(SandboxUnavailableError);
        expect((error as SandboxUnavailableError).reason).toBe(UNAVAILABLE_STATUS.reason);
        expect((error as SandboxUnavailableError).message).toContain(
          'Either install provider dependencies or disable sandboxing for server "test-server"',
        );
      }
    });
  });

  describe('when SandboxManager throws', () => {
    it('propagates the error', async () => {
      jest.mocked(SandboxManager.initialize).mockRejectedValueOnce(new Error('srt init failed'));

      const wrapper = createWrapper();

      await expect(wrapper.transform('test-server', defaultParams, '/workspace')).rejects.toThrow(
        'srt init failed',
      );
    });
  });

  describe('when deniedDomains is set in the config', () => {
    it('passes deniedDomains through to SandboxManager.initialize', async () => {
      const configWithDenied: SandboxConfig = {
        ...BASE_CONFIG,
        network: {
          allowedDomains: ['gitlab.com'],
          deniedDomains: ['evil.com'],
        },
      };
      jest.mocked(mockSandboxConfigService.getMcpServerConfig).mockReturnValue(configWithDenied);

      const wrapper = createWrapper();
      await wrapper.transform('test-server', defaultParams, '/workspace');

      expect(SandboxManager.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          network: expect.objectContaining({ deniedDomains: ['evil.com'] }),
        }),
        undefined,
        true,
      );
    });
  });
});
