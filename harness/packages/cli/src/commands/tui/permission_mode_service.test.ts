import { describe, expect, it } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import type { ParsedCliInput } from '../../parse';
import { DefaultPermissionModeService } from './permission_mode_service';

const cliInput = (auto: boolean): ParsedCliInput =>
  createFakePartial<ParsedCliInput>({
    command: { name: 'tui', auto } as ParsedCliInput['command'],
  });

describe('DefaultPermissionModeService', () => {
  it('defaults to "default" mode', () => {
    const service = new DefaultPermissionModeService(new TestLogger(), cliInput(false));

    expect(service.getMode()).toBe('default');
    expect(service.isAuto()).toBe(false);
  });

  it('starts in auto mode when the --auto flag is set', () => {
    const service = new DefaultPermissionModeService(new TestLogger(), cliInput(true));

    expect(service.getMode()).toBe('auto');
    expect(service.isAuto()).toBe(true);
  });

  it('setMode switches modes', () => {
    const service = new DefaultPermissionModeService(new TestLogger(), cliInput(false));

    service.setMode('auto');
    expect(service.isAuto()).toBe(true);

    service.setMode('default');
    expect(service.isAuto()).toBe(false);
  });

  it('toggle flips the mode and returns the new value', () => {
    const service = new DefaultPermissionModeService(new TestLogger(), cliInput(false));

    expect(service.toggle()).toBe('auto');
    expect(service.isAuto()).toBe(true);

    expect(service.toggle()).toBe('default');
    expect(service.isAuto()).toBe(false);
  });

  it('ignores the auto flag for non-tui commands', () => {
    const service = new DefaultPermissionModeService(
      new TestLogger(),
      createFakePartial<ParsedCliInput>({
        command: { name: 'run' } as ParsedCliInput['command'],
      }),
    );

    expect(service.isAuto()).toBe(false);
  });
});
