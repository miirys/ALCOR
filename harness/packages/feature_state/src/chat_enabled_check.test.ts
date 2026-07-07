import { Disposable } from '@gitlab-org/disposable';
import { CHAT_DISABLED_BY_USER } from '@gitlab-org/core';
import { DefaultConfigService } from '@gitlab-org/config';
import { DefaultChatEnabledCheck, DefaultChatEnabledConfigCheck } from './chat_enabled_check';

describe('ChatEnabledCheck', () => {
  const disposables: Disposable[] = [];

  const configService = new DefaultConfigService();
  const chatEnabledCheck = new DefaultChatEnabledCheck(configService);
  const checkEngagedChangeListener = jest.fn();

  beforeEach(() => {
    disposables.push(chatEnabledCheck.onChanged(checkEngagedChangeListener));
  });

  afterEach(() => {
    while (disposables.length > 0) {
      disposables.pop()!.dispose();
    }
  });

  const updateConfig = async (enabled: boolean | undefined) => {
    configService.set('duoChat.enabled', enabled);

    await new Promise(process.nextTick);
  };

  it('should initialize ChatEnabledCheck correctly', () => {
    expect(chatEnabledCheck.id).toBe(CHAT_DISABLED_BY_USER);
    expect(chatEnabledCheck.details).toBe('Chat manually disabled.');
    expect(chatEnabledCheck.engaged).toBe(false);
  });

  it('should be engaged when chat is disabled', async () => {
    await updateConfig(false);

    expect(chatEnabledCheck.engaged).toBe(true);
  });

  it('should not be engaged when chat is enabled', async () => {
    await updateConfig(true);

    expect(chatEnabledCheck.engaged).toBe(false);
  });

  it('should not update engaged when chat enabled configuration is missing', async () => {
    await updateConfig(false);
    expect(chatEnabledCheck.engaged).toBe(true);

    await updateConfig(undefined);
    expect(chatEnabledCheck.engaged).toBe(true);
  });

  describe('change event', () => {
    it('emits after chat enabled is updated', async () => {
      await updateConfig(undefined);
      jest.mocked(checkEngagedChangeListener).mockClear();

      await updateConfig(true);

      expect(checkEngagedChangeListener).toHaveBeenCalledTimes(1);
    });

    it('does not emit when unrelated config is updated', async () => {
      await updateConfig(undefined);
      jest.mocked(checkEngagedChangeListener).mockClear();

      configService.set('telemetry.enabled', false);
      await new Promise(process.nextTick);

      expect(checkEngagedChangeListener).not.toHaveBeenCalled();
    });
  });
});

describe('DefaultChatEnabledConfigCheck (stateless)', () => {
  const check = new DefaultChatEnabledConfigCheck();

  it('returns engaged=true when duo chat is disabled in config', async () => {
    const result = await check.validate({ duoChat: { enabled: false } });

    expect(result).toEqual({
      checkId: CHAT_DISABLED_BY_USER,
      details: 'Chat manually disabled.',
      engaged: true,
    });
  });

  it('returns engaged=false when duo chat is enabled in config', async () => {
    const result = await check.validate({ duoChat: { enabled: true } });

    expect(result?.engaged).toBe(false);
  });

  it('returns engaged=false when duo chat config is missing', async () => {
    const result = await check.validate({});

    expect(result?.engaged).toBe(false);
  });
});
