import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import type { AppState } from '@gitlab-org/tui';
import type { ControllerApi, StateMutation } from '../../commands/tui/controller_api';
import type { PermissionModeService } from '../../commands/tui/permission_mode_service';
import { DefaultAutoCommandHandler } from './auto_command_handler';

describe('DefaultAutoCommandHandler', () => {
  let handler: DefaultAutoCommandHandler;
  let mockPermissionModeService: PermissionModeService;
  let mockApi: ControllerApi;
  let state: AppState;

  beforeEach(() => {
    state = createFakePartial<AppState>({ permissionMode: 'default' });

    mockPermissionModeService = createFakePartial<PermissionModeService>({
      getMode: jest.fn<PermissionModeService['getMode']>().mockReturnValue('default'),
      setMode: jest.fn<PermissionModeService['setMode']>(),
      isAuto: jest.fn<PermissionModeService['isAuto']>().mockReturnValue(false),
      toggle: jest.fn<PermissionModeService['toggle']>(),
    });

    mockApi = createFakePartial<ControllerApi>({
      mutateState: jest
        .fn<ControllerApi['mutateState']>()
        .mockImplementation((mutation: StateMutation) => {
          state = mutation(state);
          return state;
        }),
      showInfo: jest.fn<ControllerApi['showInfo']>(),
      showError: jest.fn<ControllerApi['showError']>(),
    });

    handler = new DefaultAutoCommandHandler(new TestLogger(), mockPermissionModeService);
  });

  it('registers as /auto with a /yolo alias', () => {
    expect(handler.command.name).toBe('/auto');
    expect(handler.command.aliases).toContain('/yolo');
  });

  it('bare /auto toggles auto mode on when off', async () => {
    await handler.execute(mockApi);

    expect(mockPermissionModeService.setMode).toHaveBeenCalledWith('auto');
    expect(state.permissionMode).toBe('auto');
    expect(mockApi.showInfo).toHaveBeenCalledWith(expect.stringContaining('Auto mode on'));
  });

  it('bare /auto toggles auto mode off when on', async () => {
    jest.mocked(mockPermissionModeService.isAuto).mockReturnValue(true);

    await handler.execute(mockApi);

    expect(mockPermissionModeService.setMode).toHaveBeenCalledWith('default');
    expect(state.permissionMode).toBe('default');
    expect(mockApi.showInfo).toHaveBeenCalledWith(expect.stringContaining('Auto mode off'));
  });

  it('/auto on enables auto mode explicitly', async () => {
    await handler.execute(mockApi, ['on']);

    expect(mockPermissionModeService.setMode).toHaveBeenCalledWith('auto');
  });

  it('/auto off disables auto mode explicitly', async () => {
    await handler.execute(mockApi, ['off']);

    expect(mockPermissionModeService.setMode).toHaveBeenCalledWith('default');
  });

  it('/auto status reports without changing the mode', async () => {
    await handler.execute(mockApi, ['status']);

    expect(mockPermissionModeService.setMode).not.toHaveBeenCalled();
    expect(mockApi.showInfo).toHaveBeenCalledWith(expect.stringContaining('off'));
  });

  it('rejects unknown arguments', async () => {
    await handler.execute(mockApi, ['bogus']);

    expect(mockPermissionModeService.setMode).not.toHaveBeenCalled();
    expect(mockApi.showError).toHaveBeenCalledWith(expect.stringContaining('bogus'));
  });
});
