import EventEmitter from 'events';
import { Injectable } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { SandboxManager } from '@anthropic-ai/sandbox-runtime';
import {
  SandboxAvailabilityService,
  SandboxAvailabilityStatus,
} from './sandbox_availability_service';
import { detectPlatform } from './platform';

// Install hints embedded in FeatureStateCheck `details` for missing srt deps.
const INSTALL_HINTS: Record<string, Record<string, string>> = {
  bwrap: { default: 'apt-get install bubblewrap' },
  socat: { default: 'apt-get install socat' },
  ripgrep: {
    macos: 'brew install ripgrep',
    default: 'apt-get install ripgrep',
  },
};

@Injectable(SandboxAvailabilityService, [Logger])
export class DesktopSandboxAvailabilityService implements SandboxAvailabilityService {
  #logger: Logger;

  #status: SandboxAvailabilityStatus;

  #statusEmitter = new EventEmitter();

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[SandboxAvailability]');
    this.#status = this.#detect();
    this.#logStatus();
  }

  getStatus(): SandboxAvailabilityStatus {
    return this.#status;
  }

  async refresh(): Promise<void> {
    const next = this.#detect();
    if (statusEquals(this.#status, next)) return;

    this.#status = next;
    this.#logStatus();
    this.#statusEmitter.emit('change', this.#status);
  }

  onStatusChanged(listener: (status: SandboxAvailabilityStatus) => void): Disposable {
    this.#statusEmitter.on('change', listener);
    return {
      dispose: () => this.#statusEmitter.removeListener('change', listener),
    };
  }

  #detect(): SandboxAvailabilityStatus {
    const platform = detectPlatform();

    if (platform === 'windows' || platform === 'unsupported') {
      return {
        available: false,
        platform,
        reason: 'unsupported_platform',
        missingDependencies: [],
      };
    }

    try {
      const result = SandboxManager.checkDependencies();

      if (result.errors.length > 0) {
        const missingDependencies = result.errors.map((error) => {
          const lowerError = error.toLowerCase();
          const matchedKey = Object.keys(INSTALL_HINTS).find((key) => lowerError.includes(key));
          const hints = matchedKey ? INSTALL_HINTS[matchedKey] : undefined;
          const installHint = hints ? (hints[platform] ?? hints.default ?? '') : '';
          return { name: error, installHint };
        });

        return {
          available: false,
          platform,
          reason: 'missing_dependencies',
          missingDependencies,
        };
      }

      if (result.warnings.length > 0) {
        for (const warning of result.warnings) {
          this.#logger.warn(`srt dependency warning: ${warning}`);
        }
      }

      const providerVersion = this.#detectSrtVersion();

      return {
        available: true,
        platform,
        provider: 'srt',
        providerVersion,
      };
    } catch (error) {
      this.#logger.warn('Sandbox dependency detection failed', error);
      return {
        available: false,
        platform,
        reason: 'detection_failed',
        missingDependencies: [],
      };
    }
  }

  #detectSrtVersion(): string | undefined {
    try {
      // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
      const pkg = require('@anthropic-ai/sandbox-runtime/package.json') as { version?: string };
      return pkg.version;
    } catch {
      return undefined;
    }
  }

  #logStatus(): void {
    const status = this.#status;

    if (status.available) {
      this.#logger.info(
        `Sandbox available: platform=${status.platform}, provider=${status.provider}, version=${status.providerVersion ?? 'unknown'}`,
      );
    } else {
      const details =
        status.reason === 'missing_dependencies'
          ? `, missing=[${status.missingDependencies.map((d) => d.name).join(', ')}]`
          : '';
      this.#logger.info(
        `Sandbox unavailable: platform=${status.platform}, reason=${status.reason}${details}`,
      );
    }
  }
}

function statusEquals(a: SandboxAvailabilityStatus, b: SandboxAvailabilityStatus): boolean {
  if (a.available !== b.available) return false;
  if (a.platform !== b.platform) return false;
  if (a.available && b.available) {
    return a.provider === b.provider && a.providerVersion === b.providerVersion;
  }
  if (!a.available && !b.available) {
    if (a.reason !== b.reason) return false;
    if (a.missingDependencies.length !== b.missingDependencies.length) return false;
    return a.missingDependencies.every(
      (dep, i) =>
        dep.name === b.missingDependencies[i].name &&
        dep.installHint === b.missingDependencies[i].installHint,
    );
  }
  return false;
}
