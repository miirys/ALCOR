import EventEmitter from 'events';
import { Disposable } from '@gitlab-org/disposable';
import { TestLogger } from '@gitlab-org/logging';
import { SANDBOX_MISSING_DEPENDENCIES } from '@gitlab-org/core';
import {
  SandboxAvailabilityService,
  SandboxAvailabilityStatus,
} from '../sandbox_availability_service';
import { DefaultSandboxMissingDependenciesCheck } from './sandbox_missing_dependencies_check';

class FakeAvailabilityService implements SandboxAvailabilityService {
  #status: SandboxAvailabilityStatus;

  #emitter = new EventEmitter();

  constructor(initial: SandboxAvailabilityStatus) {
    this.#status = initial;
  }

  getStatus(): SandboxAvailabilityStatus {
    return this.#status;
  }

  async refresh(): Promise<void> {
    /* no-op for tests */
  }

  onStatusChanged(listener: (status: SandboxAvailabilityStatus) => void): Disposable {
    this.#emitter.on('change', listener);
    return { dispose: () => this.#emitter.removeListener('change', listener) };
  }

  emit(next: SandboxAvailabilityStatus): void {
    this.#status = next;
    this.#emitter.emit('change', next);
  }
}

describe('DefaultSandboxMissingDependenciesCheck', () => {
  const buildCheck = (initial: SandboxAvailabilityStatus) => {
    const service = new FakeAvailabilityService(initial);
    const check = new DefaultSandboxMissingDependenciesCheck(service, new TestLogger());
    return { check, service };
  };

  it('is engaged when reason is missing_dependencies and inlines hints into details', () => {
    const missing = [
      { name: 'bwrap', installHint: 'apt-get install bubblewrap' },
      { name: 'ripgrep', installHint: 'apt-get install ripgrep' },
    ];
    const { check } = buildCheck({
      available: false,
      platform: 'linux',
      reason: 'missing_dependencies',
      missingDependencies: missing,
    });

    expect(check.id).toBe(SANDBOX_MISSING_DEPENDENCIES);
    expect(check.engaged).toBe(true);
    expect(check.context).toEqual({
      platform: 'linux',
      missingDependencies: missing,
      providerVersion: undefined,
    });
    expect(check.details).toBe(
      'Process sandbox is missing required system dependencies: ' +
        'bwrap (apt-get install bubblewrap), ripgrep (apt-get install ripgrep).',
    );
  });

  it('falls back to the dependency name in details when no installHint is provided', () => {
    const { check } = buildCheck({
      available: false,
      platform: 'linux',
      reason: 'missing_dependencies',
      missingDependencies: [{ name: 'mystery', installHint: '' }],
    });

    expect(check.details).toBe('Process sandbox is missing required system dependencies: mystery.');
  });

  it('is not engaged on the healthy path but still surfaces platform and srt version', () => {
    const { check } = buildCheck({
      available: true,
      platform: 'macos',
      provider: 'srt',
      providerVersion: '0.0.49',
    });

    expect(check.engaged).toBe(false);
    expect(check.context).toEqual({
      platform: 'macos',
      missingDependencies: [],
      providerVersion: '0.0.49',
    });
  });

  it('is not engaged when the reason is unsupported_platform', () => {
    const { check } = buildCheck({
      available: false,
      platform: 'windows',
      reason: 'unsupported_platform',
      missingDependencies: [],
    });

    expect(check.engaged).toBe(false);
    expect(check.context).toEqual({
      platform: 'windows',
      missingDependencies: [],
      providerVersion: undefined,
    });
  });

  it('is not engaged when detection failed', () => {
    const { check } = buildCheck({
      available: false,
      platform: 'linux',
      reason: 'detection_failed',
      missingDependencies: [],
    });

    expect(check.engaged).toBe(false);
  });

  it('emits when missing dependencies appear', () => {
    const { check, service } = buildCheck({
      available: true,
      platform: 'linux',
      provider: 'srt',
      providerVersion: '0.0.49',
    });
    const onChanged = jest.fn();
    check.onChanged(onChanged);

    service.emit({
      available: false,
      platform: 'linux',
      reason: 'missing_dependencies',
      missingDependencies: [{ name: 'bwrap', installHint: 'apt-get install bubblewrap' }],
    });

    expect(check.engaged).toBe(true);
    expect(onChanged).toHaveBeenCalledWith(
      expect.objectContaining({ checkId: SANDBOX_MISSING_DEPENDENCIES, engaged: true }),
    );
  });

  it('emits when missing dependencies are resolved', () => {
    const { check, service } = buildCheck({
      available: false,
      platform: 'linux',
      reason: 'missing_dependencies',
      missingDependencies: [{ name: 'bwrap', installHint: 'apt-get install bubblewrap' }],
    });
    const onChanged = jest.fn();
    check.onChanged(onChanged);

    service.emit({
      available: true,
      platform: 'linux',
      provider: 'srt',
      providerVersion: '0.0.49',
    });

    expect(check.engaged).toBe(false);
    expect(onChanged).toHaveBeenCalledWith(
      expect.objectContaining({ checkId: SANDBOX_MISSING_DEPENDENCIES, engaged: false }),
    );
  });

  it('does not emit when status changes but engagement does not', () => {
    const { check, service } = buildCheck({
      available: true,
      platform: 'macos',
      provider: 'srt',
      providerVersion: '0.0.49',
    });
    const onChanged = jest.fn();
    check.onChanged(onChanged);

    service.emit({
      available: true,
      platform: 'macos',
      provider: 'srt',
      providerVersion: '0.0.50',
    });

    expect(check.engaged).toBe(false);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('refreshes context lazily so consumers see the latest dependency list', () => {
    const { check, service } = buildCheck({
      available: false,
      platform: 'linux',
      reason: 'missing_dependencies',
      missingDependencies: [{ name: 'bwrap', installHint: 'apt-get install bubblewrap' }],
    });

    service.emit({
      available: false,
      platform: 'linux',
      reason: 'missing_dependencies',
      missingDependencies: [
        { name: 'bwrap', installHint: 'apt-get install bubblewrap' },
        { name: 'socat', installHint: 'apt-get install socat' },
      ],
    });

    expect(check.context.missingDependencies).toHaveLength(2);
  });

  it('cleans up its availability subscription on dispose', () => {
    const { check, service } = buildCheck({
      available: true,
      platform: 'macos',
      provider: 'srt',
      providerVersion: '0.0.49',
    });
    const onChanged = jest.fn();
    check.onChanged(onChanged);

    check.dispose();
    service.emit({
      available: false,
      platform: 'macos',
      reason: 'missing_dependencies',
      missingDependencies: [{ name: 'rg', installHint: 'brew install ripgrep' }],
    });

    expect(onChanged).not.toHaveBeenCalled();
  });
});
