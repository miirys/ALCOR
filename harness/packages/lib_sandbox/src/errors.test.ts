import { SandboxUnavailableError, isSandboxUnavailableError } from './errors';

describe('SandboxUnavailableError', () => {
  it('sets name to "SandboxUnavailableError"', () => {
    const error = new SandboxUnavailableError('boom', 'missing_dependencies');

    expect(error.name).toBe('SandboxUnavailableError');
  });

  it('preserves the message argument', () => {
    const error = new SandboxUnavailableError('boom', 'missing_dependencies');

    expect(error.message).toBe('boom');
  });

  it('stores the reason argument as a readonly field', () => {
    const error = new SandboxUnavailableError('boom', 'unsupported_platform');

    expect(error.reason).toBe('unsupported_platform');
  });

  it.each(['missing_dependencies', 'unsupported_platform', 'detection_failed'] as const)(
    'round-trips reason "%s"',
    (reason) => {
      const error = new SandboxUnavailableError('boom', reason);

      expect(error.reason).toBe(reason);
    },
  );

  it('is instanceof Error and SandboxUnavailableError', () => {
    const error = new SandboxUnavailableError('boom', 'missing_dependencies');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SandboxUnavailableError);
  });

  it('captures a stack trace that excludes the constructor frame', () => {
    const error = new SandboxUnavailableError('boom', 'missing_dependencies');

    expect(error.stack).toBeDefined();
    expect(error.stack).not.toContain('SandboxUnavailableError.constructor');
  });
});

describe('isSandboxUnavailableError', () => {
  it('returns true for a SandboxUnavailableError instance', () => {
    const error = new SandboxUnavailableError('boom', 'missing_dependencies');

    expect(isSandboxUnavailableError(error)).toBe(true);
  });

  it('returns false for a plain Error', () => {
    expect(isSandboxUnavailableError(new Error('boom'))).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string', 'boom'],
    ['number', 42],
    ['plain object', { message: 'boom', reason: 'missing_dependencies' }],
  ])('returns false for %s', (_label, value) => {
    expect(isSandboxUnavailableError(value)).toBe(false);
  });
});
