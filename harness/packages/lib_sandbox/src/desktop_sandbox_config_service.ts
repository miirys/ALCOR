import { Injectable, Disposable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import { isBunRuntime } from '@gitlab-org/core';
import { SandboxConfigService } from './sandbox_config_service';
import { SandboxConfig, McpServerSandboxOverrides } from './sandbox_config_types';
import { detectPlatform } from './platform';

const DENY_READ_DEFAULTS: readonly string[] = [
  // SSH / GPG / netrc / git
  '~/.ssh/',
  '~/.gnupg/',
  '~/.netrc',
  '~/.git-credentials',
  // Cloud + package manager credentials
  '~/.npmrc',
  '~/.pypirc',
  '~/.docker/config.json',
  '~/.aws/',
  '~/.azure/',
  '~/.kube/config',
  '~/.cargo/credentials.toml',
  '~/.cargo/config.toml',
  '~/.cargo/config',
  '~/.vault-token',
  '~/.sentryclirc',
  '~/.yarnrc.yml',
  // Broad ~/.config deny; ~/.config/git/ stays readable via the allow list below.
  '~/.config/',
  // Local credential / password stores
  '~/.password-store/',
  '~/.local/share/keyrings/',
  '~/.gnome2/keyrings/',
  // User document directories
  '~/Documents/',
  '~/Downloads/',
  '~/Desktop/',
  '~/Pictures/',
  '~/Movies/',
  '~/Music/',
  // macOS application data: Slack tokens, browser cookies, etc.
  '~/Library/Application Support/',
  // macOS app sandbox containers: 1Password vaults live in Group Containers.
  '~/Library/Containers/',
  '~/Library/Group Containers/',
  // macOS keychain databases
  '~/Library/Keychains/',
  // Shell history (can contain pasted tokens)
  '~/.bash_history',
  '~/.zsh_history',
];

const ALLOW_READ_DEFAULTS_COMMON: readonly string[] = [
  '/tmp/',
  '/usr/',
  '/bin/',
  '/sbin/',
  '/etc/',
  '~/.gitlab/duo/',
  '~/.gitconfig',
  '~/.config/git/',
  '~/.nvm/',
  '~/.bun/',
  '~/.volta/',
];

// macOS symlinks /tmp -> /private/tmp and /var -> /private/var; list both forms.
const ALLOW_READ_DEFAULTS_MACOS: readonly string[] = [
  '/private/tmp/',
  '/var/folders/',
  '/private/var/folders/',
  '/opt/homebrew/',
  '/Library/Frameworks/',
  '/System/Library/',
  '/Applications/',
];

// Skip broad deny under bun on macOS — bun has two startup-time fs-dependence
// bugs that any broad deny exposes:
//   - oven-sh/bun#27802: process.env empty under Seatbelt
//   - oven-sh/bun#28220: CouldntReadCurrentDirectory walking cwd ancestors
// Tracked: https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/work_items/2407
function broadDenySupported(): boolean {
  return !(detectPlatform() === 'macos' && isBunRuntime());
}

function getPlatformDefaults(): { allowRead: string[]; denyRead: string[] } {
  switch (detectPlatform()) {
    case 'macos':
      return {
        allowRead: [...ALLOW_READ_DEFAULTS_COMMON, ...ALLOW_READ_DEFAULTS_MACOS],
        denyRead: broadDenySupported() ? ['/'] : [],
      };
    case 'linux':
      return {
        allowRead: [...ALLOW_READ_DEFAULTS_COMMON, '/snap/'],
        denyRead: ['/'],
      };
    default:
      return { allowRead: [...ALLOW_READ_DEFAULTS_COMMON], denyRead: [] };
  }
}

// Paths allowed for writes by default.
const ALLOW_WRITE_DEFAULTS: readonly string[] = ['/tmp'];

// Provider also enforces its own mandatory deny-write list (.bashrc, .profile, etc.) on top.
const DENY_WRITE_DEFAULTS: readonly string[] = [
  '.git/hooks/',
  '.gitlab-ci.yml',
  '.gitlab/',
  '.gitconfig',
];

const MAX_CACHE_SIZE = 50;

@Injectable(SandboxConfigService, [ConfigService, Logger])
export class DesktopSandboxConfigService implements SandboxConfigService {
  #configService: ConfigService;

  #logger: Logger;

  #instanceDomain: string | undefined;

  #configChangeDisposable?: Disposable;

  // LRU cache for memoized MCP server configs.
  // Key: `${workspacePath}:${serverName}`, Value: deep-copied config.
  #mcpConfigCache: Map<string, SandboxConfig> = new Map();

  constructor(configService: ConfigService, logger: Logger) {
    this.#configService = configService;
    this.#logger = withPrefix(logger, '[SandboxConfig]');
    this.#instanceDomain = this.#extractInstanceDomain();

    this.#configChangeDisposable = this.#configService.onConfigChange(() => {
      this.refresh();
    });
  }

  getEffectiveWorkspaceConfig(workspacePath: string): SandboxConfig {
    this.#logger.debug(`Building sandbox config for workspace: ${workspacePath}`);

    const platformDefaults = getPlatformDefaults();

    return {
      provider: 'anthropic-sandbox-runtime',
      filesystem: {
        allowRead: [workspacePath, ...platformDefaults.allowRead],
        denyRead: [...platformDefaults.denyRead, ...DENY_READ_DEFAULTS],
        allowWrite: [workspacePath, ...ALLOW_WRITE_DEFAULTS],
        denyWrite: [...DENY_WRITE_DEFAULTS],
      },
      network: {
        allowedDomains: this.#instanceDomain ? [this.#instanceDomain] : [],
      },
    };
  }

  getMcpServerConfig(
    workspacePath: string,
    serverName: string,
    overrides?: McpServerSandboxOverrides,
  ): SandboxConfig {
    const cacheKey = `${workspacePath}:${serverName}`;

    // Return cached config if no overrides and cache hit.
    if (!overrides) {
      const cached = this.#mcpConfigCache.get(cacheKey);
      if (cached) {
        return this.#deepCopy(cached);
      }
    }

    const base = this.getEffectiveWorkspaceConfig(workspacePath);

    if (!overrides) {
      this.#cacheConfig(cacheKey, base);
      return base;
    }

    // Deep copy before mutation to avoid affecting base config.
    const config = this.#deepCopy(base);

    if (overrides.allowedDomains?.length) {
      config.network.allowedDomains = [
        ...config.network.allowedDomains,
        ...overrides.allowedDomains,
      ];
    }

    if (overrides.allowRead?.length) {
      config.filesystem.allowRead = [
        ...(config.filesystem.allowRead ?? []),
        ...overrides.allowRead,
      ];
    }

    if (overrides.allowWrite?.length) {
      config.filesystem.allowWrite = [...config.filesystem.allowWrite, ...overrides.allowWrite];
    }

    if (overrides.denyRead?.length) {
      config.filesystem.denyRead = [...config.filesystem.denyRead, ...overrides.denyRead];
    }

    // Don't cache override-merged configs — the cache key doesn't include
    // overrides, so a later no-override call would incorrectly reuse them.
    return config;
  }

  refresh(): void {
    this.#instanceDomain = this.#extractInstanceDomain();
    this.#mcpConfigCache.clear();
    this.#logger.debug(
      `Refreshed sandbox config, instanceDomain=${this.#instanceDomain ?? 'none'}`,
    );
  }

  dispose(): void {
    this.#configChangeDisposable?.dispose();
    this.#mcpConfigCache.clear();
  }

  #extractInstanceDomain(): string | undefined {
    const baseUrl = this.#configService.get('baseUrl') as string | undefined;

    if (!baseUrl) {
      return undefined;
    }

    try {
      // allowedDomains matches on hostname only (proxy-based filtering).
      // Non-default ports in baseUrl are intentionally dropped.
      return new URL(baseUrl).hostname;
    } catch {
      this.#logger.warn(`Failed to parse baseUrl: ${baseUrl}`);
      return undefined;
    }
  }

  #cacheConfig(key: string, config: SandboxConfig): void {
    // Simple LRU: evict oldest entry if at capacity.
    if (this.#mcpConfigCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = this.#mcpConfigCache.keys().next().value;
      if (oldestKey) {
        this.#mcpConfigCache.delete(oldestKey);
      }
    }
    this.#mcpConfigCache.set(key, this.#deepCopy(config));
  }

  #deepCopy<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}
