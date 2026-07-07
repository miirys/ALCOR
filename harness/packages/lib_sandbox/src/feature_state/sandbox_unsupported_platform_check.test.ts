import EventEmitter from 'events';
import { Disposable } from '@gitlab-org/disposable';
import { TestLogger } from '@gitlab-org/logging';
import { SANDBOX_UNSUPPORTED_PLATFORM } from '@gitlab-org/core';
import {
  SandboxAvailabilityService,
  SandboxAvailabilityStatus,
} from '../sandbox_availability_service';
import { DefaultSandboxUnsupportedPlatformCheck } from './sandbox_unsupported_platform_check';

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

describe('DefaultSandboxUnsupportedPlatformCheck', () => {
  const buildCheck = (initial: SandboxAvailabilityStatus) => {
    const service = new FakeAvailabilityService(initial);
    const check = new DefaultSandboxUnsupportedPlatformCheck(service, new TestLogger());
    return { check, service };
  };

  it('is engaged on windows with the detected platform in context', () => {
    const { check } = buildCheck({
      available: false,
      platform: 'windows',
      reason: 'unsupported_platform',
      missingDependencies: [],
    });

    expect(check.id).toBe(SANDBOX_UNSUPPORTED_PLATFORM);
    expect(check.engaged).toBe(true);
    expect(check.context).toEqual({ platform: 'windows' });
  });

  it('is engaged on unrecognised platforms', () => {
    const { check } = buildCheck({
      available: false,
      platform: 'unsupported',
      reason: 'unsupported_platform',
      missingDependencies: [],
    });

    expect(check.engaged).toBe(true);
    expect(check.context).toEqual({ platform: 'unsupported' });
  });

  it('is not engaged on macos', () => {
    const { check } = buildCheck({
      available: true,
      platform: 'macos',
      provider: 'srt',
      providerVersion: '0.0.49',
    });

    expect(check.engaged).toBe(false);
    expect(check.context).toBeUndefined();
  });

  it('is not engaged on linux', () => {
    const { check } = buildCheck({
      available: true,
      platform: 'linux',
      provider: 'srt',
      providerVersion: '0.0.49',
    });

    expect(check.engaged).toBe(false);
  });

  it('is not engaged when dependencies are the reason for unavailability', () => {
    const { check } = buildCheck({
      available: false,
      platform: 'linux',
      reason: 'missing_dependencies',
      missingDependencies: [{ name: 'bwrap', installHint: 'apt-get install bubblewrap' }],
    });

    expect(check.engaged).toBe(false);
  });

  it('emits when platform transitions across the supported boundary', () => {
    const { check, service } = buildCheck({
      available: false,
      platform: 'windows',
      reason: 'unsupported_platform',
      missingDependencies: [],
    });
    const onChanged = jest.fn();
    check.onChanged(onChanged);

    service.emit({
      available: true,
      platform: 'macos',
      provider: 'srt',
      providerVersion: '0.0.49',
    });

    expect(check.engaged).toBe(false);
    expect(onChanged).toHaveBeenCalledWith(
      expect.objectContaining({ checkId: SANDBOX_UNSUPPORTED_PLATFORM, engaged: false }),
    );
  });

  it('does not emit when platform changes but engagement does not', () => {
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
      platform: 'linux',
      provider: 'srt',
      providerVersion: '0.0.49',
    });

    expect(check.engaged).toBe(false);
    expect(onChanged).not.toHaveBeenCalled();
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
      platform: 'windows',
      reason: 'unsupported_platform',
      missingDependencies: [],
    });

    expect(onChanged).not.toHaveBeenCalled();
  });
});
