import { Disposable } from '@gitlab-org/disposable';
import { AGENT_PLATFORM_DISABLED_BY_USER } from '@gitlab-org/core';
import { DefaultConfigService } from '@gitlab-org/config';
import {
  DefaultAgentPlatformEnabledCheck,
  DefaultAgentPlatformEnabledConfigCheck,
} from './agent_platform_enabled_check';

describe('AgentPlatformEnabledCheck', () => {
  const disposables: Disposable[] = [];

  const configService = new DefaultConfigService();
  const agentPlatformEnabledCheck = new DefaultAgentPlatformEnabledCheck(configService);
  const checkEngagedChangeListener = jest.fn();

  beforeEach(() => {
    disposables.push(agentPlatformEnabledCheck.onChanged(checkEngagedChangeListener));
  });

  afterEach(() => {
    while (disposables.length > 0) {
      disposables.pop()!.dispose();
    }
  });

  const updateConfig = async (enabled: boolean | undefined) => {
    configService.set('duo.agentPlatform', { enabled });

    await new Promise(process.nextTick);
  };

  it('should initialize AgentPlatformEnabledCheck correctly', () => {
    expect(agentPlatformEnabledCheck.id).toBe(AGENT_PLATFORM_DISABLED_BY_USER);
    expect(agentPlatformEnabledCheck.details).toBe('Agent Platform disabled in settings.');
    expect(agentPlatformEnabledCheck.engaged).toBe(false);
  });

  it('should be engaged when chat is disabled', async () => {
    await updateConfig(false);

    expect(agentPlatformEnabledCheck.engaged).toBe(true);
  });

  it('should not be engaged when chat is enabled', async () => {
    await updateConfig(true);

    expect(agentPlatformEnabledCheck.engaged).toBe(false);
  });

  it('should not update engaged when chat enabled configuration is missing', async () => {
    await updateConfig(false);
    expect(agentPlatformEnabledCheck.engaged).toBe(true);

    await updateConfig(undefined);
    expect(agentPlatformEnabledCheck.engaged).toBe(true);
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

describe('DefaultAgentPlatformEnabledConfigCheck (stateless)', () => {
  const check = new DefaultAgentPlatformEnabledConfigCheck();

  it('returns engaged=true when agent platform is disabled in config', async () => {
    const result = await check.validate({ duo: { agentPlatform: { enabled: false } } });

    expect(result).toEqual({
      checkId: AGENT_PLATFORM_DISABLED_BY_USER,
      details: 'Agent Platform disabled in settings.',
      engaged: true,
    });
  });

  it('returns engaged=false with enabled-details when agent platform is enabled', async () => {
    const result = await check.validate({ duo: { agentPlatform: { enabled: true } } });

    expect(result).toEqual({
      checkId: AGENT_PLATFORM_DISABLED_BY_USER,
      details: 'Agent Platform is enabled.',
      engaged: false,
    });
  });

  it('returns engaged=false when agent platform config is missing', async () => {
    const result = await check.validate({});

    expect(result?.engaged).toBe(false);
  });
});
