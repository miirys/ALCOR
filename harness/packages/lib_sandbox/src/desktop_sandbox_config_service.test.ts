import { TestLogger } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DesktopSandboxConfigService } from './desktop_sandbox_config_service';

describe('DesktopSandboxConfigService', () => {
  let mockLogger: TestLogger;
  let mockConfigService: ConfigService;
  let configChangeCallback: ((config: unknown) => void) | undefined;

  const originalPlatform = process.platform;

  const setPlatform = (value: NodeJS.Platform) => {
    Object.defineProperty(process, 'platform', { value, configurable: true });
  };

  beforeEach(() => {
    mockLogger = new TestLogger();
    configChangeCallback = undefined;

    mockConfigService = createFakePartial<ConfigService>({
      get: jest.fn().mockImplementation((key?: string) => {
        if (key === 'baseUrl') return 'https://gitlab.example.com/';
        return undefined;
      }),
      onConfigChange: jest.fn().mockImplementation((callback) => {
        configChangeCallback = callback;
        return { dispose: jest.fn() };
      }),
    });
  });

  afterEach(() => {
    setPlatform(originalPlatform);
  });

  function createService(): DesktopSandboxConfigService {
    return new DesktopSandboxConfigService(mockConfigService, mockLogger);
  }

  describe('#getEffectiveWorkspaceConfig', () => {
    it('returns anthropic-sandbox-runtime as the provider', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.provider).toBe('anthropic-sandbox-runtime');
    });

    it('includes the absolute workspace path in allowWrite', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.allowWrite).toContain('/home/alex/project');
    });

    it('includes /tmp in allowWrite', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.allowWrite).toContain('/tmp');
    });

    it('includes the absolute workspace path in allowRead', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.allowRead).toContain('/home/alex/project');
    });

    it('allows read of /tmp/', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.allowRead).toContain('/tmp/');
    });

    it('allows read of /usr/', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.allowRead).toContain('/usr/');
    });

    it('allows read of /etc/', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.allowRead).toContain('/etc/');
    });

    it('allows read of the Duo config dir', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.allowRead).toContain('~/.gitlab/duo/');
    });

    it('allows read of git config', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.allowRead).toContain('~/.gitconfig');
    });

    it('does not allow read of credential paths in DENY_READ_DEFAULTS', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.allowRead).not.toContain('~/.ssh/');
      expect(config.filesystem.allowRead).not.toContain('~/.aws/');
      expect(config.filesystem.allowRead).not.toContain('~/.gnupg/');
    });

    describe('platform-specific allowRead', () => {
      it('includes Homebrew and macOS framework paths on darwin', () => {
        setPlatform('darwin');
        const service = createService();
        const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

        expect(config.filesystem.allowRead).toContain('/opt/homebrew/');
        expect(config.filesystem.allowRead).toContain('/Library/Frameworks/');
        expect(config.filesystem.allowRead).toContain('/private/tmp/');
        expect(config.filesystem.allowRead).toContain('/var/folders/');
      });

      it('includes /Applications/ on darwin so IDE host bundles are readable', () => {
        setPlatform('darwin');
        const service = createService();
        const config = service.getEffectiveWorkspaceConfig('/Users/alex/project');

        expect(config.filesystem.allowRead).toContain('/Applications/');
      });

      it('includes /snap/ on linux', () => {
        setPlatform('linux');
        const service = createService();
        const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

        expect(config.filesystem.allowRead).toContain('/snap/');
      });

      it('omits darwin-specific paths on linux', () => {
        setPlatform('linux');
        const service = createService();
        const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

        expect(config.filesystem.allowRead).not.toContain('/opt/homebrew/');
        expect(config.filesystem.allowRead).not.toContain('/Library/Frameworks/');
      });

      it('omits linux-specific paths on darwin', () => {
        setPlatform('darwin');
        const service = createService();
        const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

        expect(config.filesystem.allowRead).not.toContain('/snap/');
      });

      it('returns common defaults only on unsupported platforms', () => {
        setPlatform('win32');
        const service = createService();
        const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

        expect(config.filesystem.allowRead).toContain('/tmp/');
        expect(config.filesystem.allowRead).not.toContain('/snap/');
        expect(config.filesystem.allowRead).not.toContain('/opt/homebrew/');
      });
    });

    it('denies write to git hooks directory', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.denyWrite).toContain('.git/hooks/');
    });

    it('denies write to .gitlab-ci.yml', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.denyWrite).toContain('.gitlab-ci.yml');
    });

    it('denies write to .gitlab/ directory', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.denyWrite).toContain('.gitlab/');
    });

    it('denies write to .gitconfig', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.denyWrite).toContain('.gitconfig');
    });

    it('denies read of SSH keys', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.denyRead).toContain('~/.ssh/');
    });

    it('denies read of GPG keys', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.denyRead).toContain('~/.gnupg/');
    });

    it('denies read of npm credentials', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.denyRead).toContain('~/.npmrc');
    });

    it('denies read of PyPI credentials', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.denyRead).toContain('~/.pypirc');
    });

    it('denies read of Docker credentials', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.denyRead).toContain('~/.docker/config.json');
    });

    it('denies read of AWS credentials', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.denyRead).toContain('~/.aws/');
    });

    it('denies read of ~/.config/ broadly (covers gh, glab-cli, gcloud, op, etc.)', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.denyRead).toContain('~/.config/');
    });

    it('allows read of ~/.config/git/ as a carve-out from the broad ~/.config/ deny', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.allowRead).toContain('~/.config/git/');
    });

    it('denies read of Azure credentials', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.denyRead).toContain('~/.azure/');
    });

    it('denies read of Kubernetes config', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.denyRead).toContain('~/.kube/config');
    });

    it('denies read of netrc', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.denyRead).toContain('~/.netrc');
    });

    it('denies read of git credential store', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.denyRead).toContain('~/.git-credentials');
    });

    it('uses tilde-prefixed paths for home-relative credential entries in denyRead', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      const homeRelativePaths = config.filesystem.denyRead.filter((p) => p.startsWith('~/'));

      expect(homeRelativePaths.length).toBeGreaterThan(0);
    });

    it('denies read of cargo credentials', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.denyRead).toContain('~/.cargo/credentials.toml');
      expect(config.filesystem.denyRead).toContain('~/.cargo/config.toml');
    });

    it('denies read of user document directories', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.denyRead).toContain('~/Documents/');
      expect(config.filesystem.denyRead).toContain('~/Downloads/');
      expect(config.filesystem.denyRead).toContain('~/Desktop/');
    });

    it('denies read of macOS application support directory', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.denyRead).toContain('~/Library/Application Support/');
    });

    it('denies read of shell history', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem.denyRead).toContain('~/.bash_history');
      expect(config.filesystem.denyRead).toContain('~/.zsh_history');
    });

    describe('broad denyRead', () => {
      it('denies read of / on darwin under Node runtime', () => {
        setPlatform('darwin');
        const service = createService();
        const config = service.getEffectiveWorkspaceConfig('/Users/alex/project');

        expect(config.filesystem.denyRead).toContain('/');
      });

      it('denies read of / on linux', () => {
        setPlatform('linux');
        const service = createService();
        const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

        expect(config.filesystem.denyRead).toContain('/');
      });

      it('omits broad deny on unsupported platforms', () => {
        setPlatform('win32');
        const service = createService();
        const config = service.getEffectiveWorkspaceConfig('C:\\Users\\alex\\project');

        expect(config.filesystem.denyRead).not.toContain('/');
      });

      it('omits the broad deny when running under bun on darwin', () => {
        // Simulate bun-compiled binary at runtime. Bun has two startup-time
        // fs-dependence bugs that any broad deny exposes — see oven-sh/bun#27802
        // (process.env empty under Seatbelt) and oven-sh/bun#28220
        // (CouldntReadCurrentDirectory walking cwd ancestors).
        setPlatform('darwin');
        const originalVersions = process.versions;
        Object.defineProperty(process, 'versions', {
          value: { ...originalVersions, bun: '1.0.0' },
          configurable: true,
        });
        try {
          const service = createService();
          const config = service.getEffectiveWorkspaceConfig('/Users/alex/project');

          expect(config.filesystem.denyRead).not.toContain('/');
          // Enumerated denies should still be present so cargo creds, user
          // documents, etc. remain protected.
          expect(config.filesystem.denyRead).toContain('~/.cargo/credentials.toml');
          expect(config.filesystem.denyRead).toContain('~/Documents/');
        } finally {
          Object.defineProperty(process, 'versions', {
            value: originalVersions,
            configurable: true,
          });
        }
      });
    });

    it('includes the GitLab instance domain in allowedDomains', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.network.allowedDomains).toContain('gitlab.example.com');
    });

    it('does not set deniedDomains by default', () => {
      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.network.deniedDomains).toBeUndefined();
    });

    it('handles baseUrl without trailing slash', () => {
      (mockConfigService.get as jest.Mock).mockImplementation((key?: string) => {
        if (key === 'baseUrl') return 'https://gitlab.example.com';
        return undefined;
      });

      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.network.allowedDomains).toContain('gitlab.example.com');
    });

    it('extracts hostname only when baseUrl includes a non-default port', () => {
      (mockConfigService.get as jest.Mock).mockImplementation((key?: string) => {
        if (key === 'baseUrl') return 'https://gitlab.example.com:8443';
        return undefined;
      });

      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.network.allowedDomains).toContain('gitlab.example.com');
      expect(config.network.allowedDomains).not.toContain('gitlab.example.com:8443');
    });

    it('handles missing baseUrl gracefully', () => {
      (mockConfigService.get as jest.Mock).mockReturnValue(undefined);

      const service = createService();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.network.allowedDomains).toEqual([]);
    });
  });

  describe('#getMcpServerConfig', () => {
    it('returns the shared defaults when no overrides are provided', () => {
      const service = createService();
      const config = service.getMcpServerConfig('/home/alex/project', 'my-server');
      const defaultConfig = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem).toEqual(defaultConfig.filesystem);
      expect(config.network).toEqual(defaultConfig.network);
    });

    it('appends allowed domains from overrides', () => {
      const service = createService();
      const config = service.getMcpServerConfig('/home/alex/project', 'github-server', {
        allowedDomains: ['api.github.com', '*.github.com'],
      });

      expect(config.network.allowedDomains).toContain('api.github.com');
      expect(config.network.allowedDomains).toContain('*.github.com');
      expect(config.network.allowedDomains).toContain('gitlab.example.com');
    });

    it('appends allowRead paths from overrides', () => {
      const service = createService();
      const config = service.getMcpServerConfig('/home/alex/project', 'reader-server', {
        allowRead: ['/home/alex/shared-data'],
      });

      expect(config.filesystem.allowRead).toContain('/home/alex/shared-data');
    });

    it('keeps override allowRead and the broad deny side-by-side so SRT precedence resolves', () => {
      setPlatform('linux');
      const service = createService();
      const config = service.getMcpServerConfig('/home/alex/project', 'reader-server', {
        allowRead: ['/home/alex/external-data'],
      });

      expect(config.filesystem.allowRead).toContain('/home/alex/external-data');
      expect(config.filesystem.denyRead).toContain('/');
    });

    it('appends write paths from overrides', () => {
      const service = createService();
      const config = service.getMcpServerConfig('/home/alex/project', 'fs-server', {
        allowWrite: ['/home/alex/extra-dir'],
      });

      expect(config.filesystem.allowWrite).toContain('/home/alex/extra-dir');
      expect(config.filesystem.allowWrite).toContain('/home/alex/project');
      expect(config.filesystem.allowWrite).toContain('/tmp');
    });

    it('appends deny-read paths from overrides', () => {
      const service = createService();
      const config = service.getMcpServerConfig('/home/alex/project', 'secure-server', {
        denyRead: ['/etc/secrets/'],
      });

      expect(config.filesystem.denyRead).toContain('/etc/secrets/');
      expect(config.filesystem.denyRead).toContain('~/.ssh/');
    });

    it('does not mutate the shared defaults', () => {
      const service = createService();
      const before = service.getEffectiveWorkspaceConfig('/home/alex/project');

      service.getMcpServerConfig('/home/alex/project', 'github-server', {
        allowedDomains: ['api.github.com'],
        allowWrite: ['/extra'],
        denyRead: ['/secret'],
      });

      const after = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(after.network.allowedDomains).toEqual(before.network.allowedDomains);
      expect(after.filesystem.allowWrite).toEqual(before.filesystem.allowWrite);
      expect(after.filesystem.denyRead).toEqual(before.filesystem.denyRead);
    });

    it('handles empty overrides object', () => {
      const service = createService();
      const config = service.getMcpServerConfig('/home/alex/project', 'my-server', {});
      const defaultConfig = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.filesystem).toEqual(defaultConfig.filesystem);
      expect(config.network).toEqual(defaultConfig.network);
    });

    it('caches configs by workspace and server name', () => {
      const service = createService();

      const config1 = service.getMcpServerConfig('/home/alex/project', 'server-a');
      const config2 = service.getMcpServerConfig('/home/alex/project', 'server-a');

      // Should be equal but not the same reference (deep copy on retrieval).
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });

    it('does not let overrides leak into subsequent no-override calls', () => {
      const service = createService();

      // First call WITH overrides
      service.getMcpServerConfig('/home/alex/project', 'server-a', {
        allowedDomains: ['extra.com'],
      });

      // Second call WITHOUT overrides — should return base config
      const config = service.getMcpServerConfig('/home/alex/project', 'server-a');

      expect(config.network.allowedDomains).not.toContain('extra.com');
    });

    it('returns different configs for different servers', () => {
      const service = createService();

      const configA = service.getMcpServerConfig('/home/alex/project', 'server-a', {
        allowedDomains: ['a.example.com'],
      });
      const configB = service.getMcpServerConfig('/home/alex/project', 'server-b', {
        allowedDomains: ['b.example.com'],
      });

      expect(configA.network.allowedDomains).toContain('a.example.com');
      expect(configA.network.allowedDomains).not.toContain('b.example.com');
      expect(configB.network.allowedDomains).toContain('b.example.com');
      expect(configB.network.allowedDomains).not.toContain('a.example.com');
    });
  });

  describe('#refresh', () => {
    it('picks up baseUrl changes', () => {
      const service = createService();

      (mockConfigService.get as jest.Mock).mockImplementation((key?: string) => {
        if (key === 'baseUrl') return 'https://new-gitlab.example.com/';
        return undefined;
      });

      service.refresh();
      const config = service.getEffectiveWorkspaceConfig('/home/alex/project');

      expect(config.network.allowedDomains).toContain('new-gitlab.example.com');
      expect(config.network.allowedDomains).not.toContain('gitlab.example.com');
    });

    it('clears the MCP config cache', () => {
      const service = createService();

      // Populate cache.
      service.getMcpServerConfig('/home/alex/project', 'server-a', {
        allowedDomains: ['old.example.com'],
      });

      // Change baseUrl and refresh.
      (mockConfigService.get as jest.Mock).mockImplementation((key?: string) => {
        if (key === 'baseUrl') return 'https://new-gitlab.example.com/';
        return undefined;
      });
      service.refresh();

      // New config should reflect refreshed state.
      const config = service.getMcpServerConfig('/home/alex/project', 'server-a', {
        allowedDomains: ['old.example.com'],
      });

      expect(config.network.allowedDomains).toContain('new-gitlab.example.com');
    });

    it('is triggered automatically on config change', () => {
      const service = createService();

      // Initial state.
      let config = service.getEffectiveWorkspaceConfig('/home/alex/project');
      expect(config.network.allowedDomains).toContain('gitlab.example.com');

      // Simulate config change.
      (mockConfigService.get as jest.Mock).mockImplementation((key?: string) => {
        if (key === 'baseUrl') return 'https://auto-refreshed.example.com/';
        return undefined;
      });
      configChangeCallback?.({});

      // Should have auto-refreshed.
      config = service.getEffectiveWorkspaceConfig('/home/alex/project');
      expect(config.network.allowedDomains).toContain('auto-refreshed.example.com');
    });
  });

  describe('#dispose', () => {
    it('disposes the config change subscription', () => {
      const disposeMock = jest.fn();
      (mockConfigService.onConfigChange as jest.Mock).mockReturnValue({ dispose: disposeMock });

      const service = createService();
      service.dispose();

      expect(disposeMock).toHaveBeenCalled();
    });
  });
});
