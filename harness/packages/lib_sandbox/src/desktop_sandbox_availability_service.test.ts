import { SandboxManager } from '@anthropic-ai/sandbox-runtime';
import { TestLogger } from '@gitlab-org/logging';
import { DesktopSandboxAvailabilityService } from './desktop_sandbox_availability_service';

jest.mock('@anthropic-ai/sandbox-runtime', () => ({
  SandboxManager: {
    checkDependencies: jest.fn(),
  },
}));

const mockCheckDependencies = SandboxManager.checkDependencies as jest.MockedFunction<
  typeof SandboxManager.checkDependencies
>;

describe('DesktopSandboxAvailabilityService', () => {
  let mockLogger: TestLogger;

  beforeEach(() => {
    mockLogger = new TestLogger();
  });

  function createService(): DesktopSandboxAvailabilityService {
    return new DesktopSandboxAvailabilityService(mockLogger);
  }

  describe('on unsupported platforms', () => {
    it('returns unavailable on Windows', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      try {
        const service = createService();
        const status = service.getStatus();

        expect(status.available).toBe(false);
        if (!status.available) {
          expect(status.platform).toBe('windows');
          expect(status.reason).toBe('unsupported_platform');
          expect(status.missingDependencies).toEqual([]);
        }
        expect(mockCheckDependencies).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });

    it('returns unavailable on unrecognized platforms', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'freebsd' });

      try {
        const service = createService();
        const status = service.getStatus();

        expect(status.available).toBe(false);
        if (!status.available) {
          expect(status.platform).toBe('unsupported');
          expect(status.reason).toBe('unsupported_platform');
        }
        expect(mockCheckDependencies).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });
  });

  describe('on Linux', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('returns available when checkDependencies reports no errors', () => {
      mockCheckDependencies.mockReturnValue({ errors: [], warnings: [] });

      const service = createService();
      const status = service.getStatus();

      expect(status.available).toBe(true);
      if (status.available) {
        expect(status.platform).toBe('linux');
      }
      expect(mockCheckDependencies).toHaveBeenCalled();
    });

    it('returns unavailable when checkDependencies reports errors', () => {
      mockCheckDependencies.mockReturnValue({
        errors: ['bubblewrap (bwrap) not installed', 'socat not installed'],
        warnings: [],
      });

      const service = createService();
      const status = service.getStatus();

      expect(status.available).toBe(false);
      if (!status.available) {
        expect(status.reason).toBe('missing_dependencies');
        expect(status.missingDependencies).toHaveLength(2);
      }
    });

    it('includes install hints for known dependencies', () => {
      mockCheckDependencies.mockReturnValue({
        errors: ['bubblewrap (bwrap) not installed'],
        warnings: [],
      });

      const service = createService();
      const status = service.getStatus();

      expect(status.available).toBe(false);
      if (!status.available) {
        expect(status.missingDependencies[0].installHint).toBe('apt-get install bubblewrap');
      }
    });

    it('logs warnings from checkDependencies', () => {
      mockCheckDependencies.mockReturnValue({
        errors: [],
        warnings: ['seccomp not available - unix socket access not restricted'],
      });

      const service = createService();
      const status = service.getStatus();

      expect(status.available).toBe(true);
      expect(mockLogger.warnLogs).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('seccomp not available'),
        }),
      );
    });
  });

  describe('on macOS', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('returns available when checkDependencies reports no errors', () => {
      mockCheckDependencies.mockReturnValue({ errors: [], warnings: [] });

      const service = createService();
      const status = service.getStatus();

      expect(status.available).toBe(true);
      if (status.available) {
        expect(status.platform).toBe('macos');
      }
    });

    it('returns unavailable when ripgrep is missing', () => {
      mockCheckDependencies.mockReturnValue({
        errors: ['ripgrep (rg) not found'],
        warnings: [],
      });

      const service = createService();
      const status = service.getStatus();

      expect(status.available).toBe(false);
      if (!status.available) {
        expect(status.reason).toBe('missing_dependencies');
        expect(status.missingDependencies).toHaveLength(1);
        expect(status.missingDependencies[0].installHint).toContain('brew install ripgrep');
      }
    });
  });

  describe('when checkDependencies throws', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('returns detection_failed', () => {
      mockCheckDependencies.mockImplementation(() => {
        throw new Error('unexpected failure');
      });

      const service = createService();
      const status = service.getStatus();

      expect(status.available).toBe(false);
      if (!status.available) {
        expect(status.reason).toBe('detection_failed');
        expect(status.missingDependencies).toEqual([]);
      }
    });
  });

  describe('#refresh', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('re-detects availability', async () => {
      mockCheckDependencies.mockReturnValue({
        errors: ['bubblewrap (bwrap) not installed'],
        warnings: [],
      });

      const service = createService();
      expect(service.getStatus().available).toBe(false);

      mockCheckDependencies.mockReturnValue({ errors: [], warnings: [] });
      await service.refresh();
      expect(service.getStatus().available).toBe(true);
    });

    it('fires onStatusChanged when refresh produces a different status', async () => {
      mockCheckDependencies.mockReturnValue({
        errors: ['bubblewrap (bwrap) not installed'],
        warnings: [],
      });

      const service = createService();
      const listener = jest.fn();
      service.onStatusChanged(listener);

      mockCheckDependencies.mockReturnValue({ errors: [], warnings: [] });
      await service.refresh();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ available: true }));
    });

    it('does not fire onStatusChanged when refresh produces an identical status', async () => {
      mockCheckDependencies.mockReturnValue({ errors: [], warnings: [] });

      const service = createService();
      const listener = jest.fn();
      service.onStatusChanged(listener);

      await service.refresh();

      expect(listener).not.toHaveBeenCalled();
    });

    it('disposes onStatusChanged subscriptions cleanly', async () => {
      mockCheckDependencies.mockReturnValue({ errors: [], warnings: [] });

      const service = createService();
      const listener = jest.fn();
      const subscription = service.onStatusChanged(listener);
      subscription.dispose();

      mockCheckDependencies.mockReturnValue({
        errors: ['bubblewrap (bwrap) not installed'],
        warnings: [],
      });
      await service.refresh();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('logging', () => {
    it('logs available status at startup', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      try {
        mockCheckDependencies.mockReturnValue({ errors: [], warnings: [] });
        createService();

        expect(mockLogger.infoLogs).toContainEqual(
          expect.objectContaining({
            message: expect.stringContaining('Sandbox available'),
          }),
        );
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });

    it('logs unavailable status with reason', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      try {
        createService();

        expect(mockLogger.infoLogs).toContainEqual(
          expect.objectContaining({
            message: expect.stringContaining('Sandbox unavailable'),
          }),
        );
        expect(mockLogger.infoLogs).toContainEqual(
          expect.objectContaining({
            message: expect.stringContaining('unsupported_platform'),
          }),
        );
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });

    it('logs missing dependency names', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });

      try {
        mockCheckDependencies.mockReturnValue({
          errors: ['bubblewrap (bwrap) not installed'],
          warnings: [],
        });

        createService();

        expect(mockLogger.infoLogs).toContainEqual(
          expect.objectContaining({
            message: expect.stringContaining('bubblewrap (bwrap) not installed'),
          }),
        );
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });
  });
});
