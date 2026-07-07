import { Disposable } from '@gitlab-org/disposable';
import { SANDBOX_DISABLED_BY_USER } from '@gitlab-org/core';
import { DefaultConfigService } from '@gitlab-org/config';
import { TestLogger } from '@gitlab-org/logging';
import { DefaultSandboxDisabledByUserCheck } from './sandbox_disabled_by_user_check';

describe('DefaultSandboxDisabledByUserCheck', () => {
  const disposables: Disposable[] = [];
  let configService: DefaultConfigService;
  let check: DefaultSandboxDisabledByUserCheck;
  let onChanged: jest.Mock;

  beforeEach(() => {
    configService = new DefaultConfigService();
    check = new DefaultSandboxDisabledByUserCheck(configService, new TestLogger());
    onChanged = jest.fn();
    disposables.push(check.onChanged(onChanged));
  });

  afterEach(() => {
    while (disposables.length > 0) disposables.pop()!.dispose();
    check.dispose();
  });

  const setSandboxEnabled = async (enabled: boolean | undefined) => {
    configService.set('duo.sandbox', { enabled });
    await new Promise(process.nextTick);
  };

  it('has the expected id', () => {
    expect(check.id).toBe(SANDBOX_DISABLED_BY_USER);
  });

  it('is engaged by default when user has not opted in', () => {
    expect(check.engaged).toBe(true);
  });

  it('becomes disengaged when the user enables the flag', async () => {
    await setSandboxEnabled(true);

    expect(check.engaged).toBe(false);
    expect(onChanged).toHaveBeenCalledWith(
      expect.objectContaining({ checkId: SANDBOX_DISABLED_BY_USER, engaged: false }),
    );
  });

  it('emits only on real transitions', async () => {
    await setSandboxEnabled(false);
    expect(onChanged).not.toHaveBeenCalled();

    await setSandboxEnabled(true);
    expect(onChanged).toHaveBeenCalledTimes(1);

    await setSandboxEnabled(true);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('re-engages when the user flips the flag back off', async () => {
    await setSandboxEnabled(true);
    expect(check.engaged).toBe(false);

    await setSandboxEnabled(false);
    expect(check.engaged).toBe(true);
  });

  it('treats an undefined flag as disabled', async () => {
    await setSandboxEnabled(undefined);

    expect(check.engaged).toBe(true);
  });
});
