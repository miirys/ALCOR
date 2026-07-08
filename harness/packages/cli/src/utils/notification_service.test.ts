import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { ConfigService, INotificationsConfig } from '@gitlab-org/config';
import { NotificationService } from './notification_service';
import type { DesktopNotifier } from './desktop_notifier';

describe('NotificationService', () => {
  let mockConfig: ConfigService;
  let mockNotifier: DesktopNotifier;
  let notifications: INotificationsConfig | undefined;
  let service: NotificationService;
  const originalTermProgram = process.env.TERM_PROGRAM;

  beforeEach(() => {
    // Resolve a concrete delivery target (osc9) so delivery isn't skipped as 'none'.
    process.env.TERM_PROGRAM = 'iTerm.app';
    delete process.env.TMUX;
    delete process.env.STY;

    notifications = { channel: 'auto' };
    mockConfig = createFakePartial<ConfigService>({
      get: jest.fn((key?: string) =>
        key === 'notifications' ? notifications : undefined,
      ) as ConfigService['get'],
    });
    mockNotifier = createFakePartial<DesktopNotifier>({ notify: jest.fn(), dispose: jest.fn() });
    service = new NotificationService(new TestLogger(), mockConfig, mockNotifier);
  });

  afterEach(() => {
    process.env.TERM_PROGRAM = originalTermProgram;
  });

  it('delivers when channel is auto and terminal is unfocused', () => {
    service.notify('approval', { focused: false });

    expect(mockNotifier.notify).toHaveBeenCalledWith(
      { kind: 'osc9' },
      expect.objectContaining({ title: 'ALCOR', body: 'Approval needed to continue' }),
    );
  });

  it('uses the response_ready message for a finished turn', () => {
    service.notify('response_ready', { focused: false });

    expect(mockNotifier.notify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: 'Response ready' }),
    );
  });

  it('does not notify when the terminal is focused', () => {
    service.notify('error', { focused: true });
    expect(mockNotifier.notify).not.toHaveBeenCalled();
  });

  it('does not notify when channel is disabled', () => {
    notifications = { channel: 'disabled' };
    service.notify('error', { focused: false });
    expect(mockNotifier.notify).not.toHaveBeenCalled();
  });

  it('does not notify under a terminal multiplexer (target none)', () => {
    process.env.TMUX = '/tmp/tmux-1000/default,123,0';
    service.notify('approval', { focused: false });
    expect(mockNotifier.notify).not.toHaveBeenCalled();
  });

  it('defaults to auto when no notifications config is present', () => {
    notifications = undefined;
    service.notify('approval', { focused: false });
    expect(mockNotifier.notify).toHaveBeenCalled();
  });

  it('disposes the underlying notifier', () => {
    service.dispose();
    expect(mockNotifier.dispose).toHaveBeenCalled();
  });
});
