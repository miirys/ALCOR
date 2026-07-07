import { SandboxManager } from '@anthropic-ai/sandbox-runtime';
import type { AnthropicSRTConfig } from '../sandbox_config_types';
import { SrtSandboxProvider } from './srt_sandbox_provider';

jest.mock('@anthropic-ai/sandbox-runtime', () => ({
  SandboxManager: {
    initialize: jest.fn().mockResolvedValue(undefined),
    wrapWithSandbox: jest
      .fn()
      .mockImplementation((cmd: string) => Promise.resolve(`sandboxed[${cmd}]`)),
  },
}));

const mockInitialize = jest.mocked(SandboxManager.initialize);
const mockWrap = jest.mocked(SandboxManager.wrapWithSandbox);

describe('SrtSandboxProvider', () => {
  const provider = new SrtSandboxProvider();

  const minimalPolicy: AnthropicSRTConfig = {
    provider: 'anthropic-sandbox-runtime',
    filesystem: { denyRead: [], allowWrite: [], denyWrite: [] },
    network: { allowedDomains: [] },
  };

  it('has the srt provider id', () => {
    expect(provider.id).toBe('anthropic-sandbox-runtime');
  });

  it('returns a shell invocation wrapping the quoted, joined command', async () => {
    const invocation = await provider.wrapCommand('/bin/node', ['worker.js'], minimalPolicy);

    expect(invocation).toEqual({ kind: 'shell', command: "sandboxed['/bin/node' 'worker.js']" });
  });

  it('passes the same mapped runtime config to initialize and wrapWithSandbox', async () => {
    const policy: AnthropicSRTConfig = {
      provider: 'anthropic-sandbox-runtime',
      filesystem: {
        allowRead: ['/workspace'],
        denyRead: ['~/.ssh/'],
        allowWrite: ['/workspace', '/tmp'],
        denyWrite: ['.git/hooks/'],
      },
      network: { allowedDomains: ['gitlab.example.com'], deniedDomains: ['evil.test'] },
      ignoreViolations: { read: ['/noisy'] },
      enableWeakerNestedSandbox: true,
    };

    await provider.wrapCommand('cmd', ['--flag'], policy);

    const expectedRuntimeConfig = {
      network: { allowedDomains: ['gitlab.example.com'], deniedDomains: ['evil.test'] },
      filesystem: {
        allowRead: ['/workspace'],
        denyRead: ['~/.ssh/'],
        allowWrite: ['/workspace', '/tmp'],
        denyWrite: ['.git/hooks/'],
      },
      ignoreViolations: { read: ['/noisy'] },
      enableWeakerNestedSandbox: true,
    };
    expect(mockInitialize).toHaveBeenCalledWith(expectedRuntimeConfig, undefined, true);
    // The wrapped command and the initialized config must agree, or the jail would not match.
    expect(mockWrap).toHaveBeenCalledWith("'cmd' '--flag'", undefined, expectedRuntimeConfig);
  });

  it('defaults deniedDomains and allowRead to empty arrays when omitted', async () => {
    await provider.wrapCommand('cmd', [], minimalPolicy);

    expect(mockInitialize).toHaveBeenCalledWith(
      expect.objectContaining({
        network: { allowedDomains: [], deniedDomains: [] },
        filesystem: expect.objectContaining({ allowRead: [] }),
      }),
      undefined,
      true,
    );
  });

  it('throws when given a non-SRT policy instead of casting blindly', async () => {
    const foreign = { ...minimalPolicy, provider: 'nono' } as unknown as AnthropicSRTConfig;

    await expect(provider.wrapCommand('cmd', [], foreign)).rejects.toThrow(
      /unsupported policy provider 'nono'/,
    );
    expect(mockInitialize).not.toHaveBeenCalled();
  });
});
