import { SandboxManager } from '@anthropic-ai/sandbox-runtime';
import { TestLogger } from '@gitlab-org/logging';
import { DesktopSandboxAvailabilityService } from '@gitlab-org/sandbox';

jest.mock('@anthropic-ai/sandbox-runtime', () => ({
  SandboxManager: {
    checkDependencies: jest.fn().mockReturnValue({ errors: [], warnings: [] }),
  },
}));

/**
 * Integration test: verifies that the sandbox availability service
 * wiring and platform detection work correctly.
 *
 * Note: SandboxManager is mocked because the srt package uses ESM
 * (import.meta.url) which is incompatible with Jest's CJS transform.
 * The unit tests cover mock-based scenarios thoroughly. This test
 * verifies the service wiring and platform detection logic against
 * the real process.platform.
 */
describe('SandboxAvailabilityService integration', () => {
  let logger: TestLogger;

  const mockCheckDependencies = SandboxManager.checkDependencies as jest.MockedFunction<
    typeof SandboxManager.checkDependencies
  >;

  beforeEach(() => {
    logger = new TestLogger();
    mockCheckDependencies.mockReturnValue({ errors: [], warnings: [] });
  });

  it('detects the correct platform', () => {
    const service = new DesktopSandboxAvailabilityService(logger);
    const status = service.getStatus();

    const expectedPlatform =
      process.platform === 'darwin'
        ? 'macos'
        : process.platform === 'linux'
          ? 'linux'
          : process.platform === 'win32'
            ? 'windows'
            : 'unsupported';

    expect(status.platform).toBe(expectedPlatform);
  });

  it('reports available when checkDependencies has no errors', () => {
    mockCheckDependencies.mockReturnValue({ errors: [], warnings: [] });

    const service = new DesktopSandboxAvailabilityService(logger);
    const status = service.getStatus();

    if (process.platform === 'darwin' || process.platform === 'linux') {
      expect(status.available).toBe(true);
    } else {
      expect(status.available).toBe(false);
    }
  });

  it('reports unavailable when checkDependencies has errors', () => {
    mockCheckDependencies.mockReturnValue({
      errors: ['ripgrep (rg) not found'],
      warnings: [],
    });

    const service = new DesktopSandboxAvailabilityService(logger);
    const status = service.getStatus();

    if (process.platform === 'darwin' || process.platform === 'linux') {
      expect(status.available).toBe(false);
      if (!status.available) {
        expect(status.reason).toBe('missing_dependencies');
      }
    }
  });

  it('refresh produces the same result on repeated calls', async () => {
    mockCheckDependencies.mockReturnValue({ errors: [], warnings: [] });

    const service = new DesktopSandboxAvailabilityService(logger);
    const before = service.getStatus();

    await service.refresh();
    const after = service.getStatus();

    expect(after.available).toBe(before.available);
    expect(after.platform).toBe(before.platform);
  });
});
