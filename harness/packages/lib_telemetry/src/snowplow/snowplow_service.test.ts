import { LsFetch } from '@gitlab-org/fetch';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DefaultConfigService } from '@gitlab-org/config';
import { TestLogger } from '@gitlab-org/logging';
import { GitLabApiService } from '@gitlab-org/core';
import { DefaultSnowplowService, SnowplowService } from './snowplow_service';
import { Emitter } from './emitter';

jest.useFakeTimers();

jest.mock('./emitter');

const mockSchemaValidateFn = jest.fn();
jest.mock('ajv-draft-04', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => {
      return {
        validate: mockSchemaValidateFn,
        addMetaSchema: jest.fn(),
      };
    }),
  };
});

const mockEmitterStart = jest.fn();
const mockEmitterStop = jest.fn();
const mockPost = jest.fn();

jest.mocked(Emitter).mockReturnValue(
  createFakePartial<Emitter>({
    start: mockEmitterStart,
    stop: mockEmitterStop,
    add: jest.fn(),
  }),
);

describe('SnowplowService', () => {
  let snowplowService: SnowplowService;
  const configService = new DefaultConfigService();
  const logger = new TestLogger();
  const lsFetch = createFakePartial<LsFetch>({
    post: mockPost,
  });
  const apiService = createFakePartial<GitLabApiService>({
    onApiReconfigured: jest.fn(() => {
      return createFakePartial({
        dispose: jest.fn(),
      });
    }),
  });

  beforeEach(() => {
    mockSchemaValidateFn.mockReturnValue({ valid: true });
    snowplowService = new DefaultSnowplowService(lsFetch, configService, apiService, logger);
    mockEmitterStart.mockReset();
    mockEmitterStop.mockReset();
  });

  describe('reconfigure', () => {
    it('should restart Emitter when `trackingUrl` is changed in config', async () => {
      expect(Emitter).toHaveBeenCalledTimes(1);
      configService.set('telemetry.trackingUrl', 'http://new.tracking.com');

      expect(mockEmitterStop).toHaveBeenCalled();
      await jest.runAllTimersAsync();
      expect(Emitter).toHaveBeenCalledTimes(2);
      expect(mockEmitterStart).toHaveBeenCalled();
    });

    it('should not restart Emitter when `trackingUrl` has not changed', async () => {
      expect(Emitter).toHaveBeenCalledTimes(1);
      configService.set('telemetry.trackingUrl', 'http://new.tracking.com');
      expect(mockEmitterStop).not.toHaveBeenCalled();
      await jest.runAllTimersAsync();
      expect(Emitter).toHaveBeenCalledTimes(1);
    });
  });

  describe('validate context', () => {
    it('should run ajv validate', () => {
      const mockSchema = { field: 'string' };
      const mockContext = { field: true };
      snowplowService.validateContext(mockSchema, mockContext);
      expect(mockSchemaValidateFn).toHaveBeenCalledWith(mockSchema, mockContext);
    });
  });

  describe('stop', () => {
    it('should stop emitter when `stop` called', () => {
      snowplowService.stop();
      expect(mockEmitterStop).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should dispose all subscriptions', async () => {
      const mockDispose = jest.fn();
      const apiServiceWithDisposable = createFakePartial<GitLabApiService>({
        instanceInfo: undefined,
        onApiReconfigured: jest.fn(() => {
          return createFakePartial({ dispose: mockDispose });
        }),
      });

      const service = new DefaultSnowplowService(
        lsFetch,
        configService,
        apiServiceWithDisposable,
        logger,
      );

      service.dispose();
      expect(mockDispose).toHaveBeenCalled();
    });
  });

  describe('smart routing based on instance version', () => {
    beforeEach(() => {
      jest.mocked(Emitter).mockImplementation((...args: ConstructorParameters<typeof Emitter>) => {
        const RealEmitter = jest.requireActual('./emitter').Emitter;
        return new RealEmitter(...args);
      });
      configService.set('telemetry.trackingUrl', undefined);
    });

    it('should use event forwarder endpoint for self-managed >= 18.0', async () => {
      const apiServiceWithVersion = createFakePartial<GitLabApiService>({
        instanceInfo: {
          instanceUrl: new URL('https://gitlab.example.com'),
          instanceVersion: '18.0.0',
        },
        onApiReconfigured: jest.fn(() => {
          return createFakePartial({ dispose: jest.fn() });
        }),
      });

      const service = new DefaultSnowplowService(
        lsFetch,
        configService,
        apiServiceWithVersion,
        logger,
      );

      configService.set('telemetry.enabled', true);
      jest.mocked(mockPost).mockResolvedValueOnce({ status: 200 });

      await service.trackStructuredEvent({ category: 'test', action: 'test' }, []);
      jest.runAllTimers();

      expect(lsFetch.post).toHaveBeenCalledWith(
        'https://gitlab.example.com/-/collect_events',
        expect.any(Object),
      );
      await service.stop();
    });

    it('should use event forwarder endpoint for gitlab.com', async () => {
      const apiServiceGitlabCom = createFakePartial<GitLabApiService>({
        instanceInfo: {
          instanceUrl: new URL('https://gitlab.com'),
          instanceVersion: '18.0.0',
        },
        onApiReconfigured: jest.fn(() => {
          return createFakePartial({ dispose: jest.fn() });
        }),
      });

      const service = new DefaultSnowplowService(
        lsFetch,
        configService,
        apiServiceGitlabCom,
        logger,
      );

      configService.set('telemetry.enabled', true);
      jest.mocked(mockPost).mockResolvedValueOnce({ status: 200 });

      await service.trackStructuredEvent({ category: 'test', action: 'test' }, []);
      jest.runAllTimers();

      expect(lsFetch.post).toHaveBeenCalledWith(
        'https://gitlab.com/-/collect_events',
        expect.any(Object),
      );
      await service.stop();
    });

    it('should use default Snowplow endpoint for self-managed < 18.0', async () => {
      const apiServiceOldVersion = createFakePartial<GitLabApiService>({
        instanceInfo: {
          instanceUrl: new URL('https://gitlab.example.com'),
          instanceVersion: '17.6.0',
        },
        onApiReconfigured: jest.fn(() => {
          return createFakePartial({ dispose: jest.fn() });
        }),
      });

      const service = new DefaultSnowplowService(
        lsFetch,
        configService,
        apiServiceOldVersion,
        logger,
      );

      configService.set('telemetry.enabled', true);
      jest.mocked(mockPost).mockResolvedValueOnce({ status: 200 });

      await service.trackStructuredEvent({ category: 'test', action: 'test' }, []);
      jest.runAllTimers();

      expect(lsFetch.post).toHaveBeenCalledWith(
        'https://snowplowprd.trx.gitlab.net/com.snowplowanalytics.snowplow/tp2',
        expect.any(Object),
      );
      await service.stop();
    });

    it('should prefer custom trackingUrl over smart routing', async () => {
      configService.set('telemetry.trackingUrl', 'https://custom.tracking.endpoint');

      const apiServiceWithVersion = createFakePartial<GitLabApiService>({
        instanceInfo: {
          instanceUrl: new URL('https://gitlab.example.com'),
          instanceVersion: '18.0.0',
        },
        onApiReconfigured: jest.fn(() => {
          return createFakePartial({ dispose: jest.fn() });
        }),
      });

      const service = new DefaultSnowplowService(
        lsFetch,
        configService,
        apiServiceWithVersion,
        logger,
      );

      configService.set('telemetry.enabled', true);
      jest.mocked(mockPost).mockResolvedValueOnce({ status: 200 });

      await service.trackStructuredEvent({ category: 'test', action: 'test' }, []);
      jest.runAllTimers();

      expect(lsFetch.post).toHaveBeenCalledWith(
        'https://custom.tracking.endpoint/com.snowplowanalytics.snowplow/tp2',
        expect.any(Object),
      );
      const callHeaders = jest.mocked(mockPost).mock.calls[0][1].headers;
      expect(callHeaders).not.toHaveProperty('X-GitLab-Editor-Telemetry');
      await service.stop();
    });
  });

  describe('standard context headers', () => {
    beforeEach(() => {
      jest.mocked(Emitter).mockImplementation((...args: ConstructorParameters<typeof Emitter>) => {
        const RealEmitter = jest.requireActual('./emitter').Emitter;
        return new RealEmitter(...args);
      });
      configService.set('telemetry.trackingUrl', undefined);
      configService.set('telemetry.enabled', true);
      jest.mocked(mockPost).mockResolvedValue({ status: 200 });
    });

    const makeApiService = (
      instanceVersion: string,
      tokenInfo?: { token: string; type: 'pat' | 'oauth'; scopes: string[] },
    ) =>
      createFakePartial<GitLabApiService>({
        instanceInfo: {
          instanceUrl: new URL('https://gitlab.example.com'),
          instanceVersion,
        },
        tokenInfo,
        onApiReconfigured: jest.fn(() => createFakePartial({ dispose: jest.fn() })),
      });

    it('sets X-GitLab-Editor-Telemetry header when instance supports standard context', async () => {
      const service = new DefaultSnowplowService(
        lsFetch,
        configService,
        makeApiService('19.0.0'),
        logger,
      );
      await service.trackStructuredEvent({ category: 'test', action: 'test' }, []);
      jest.runAllTimers();

      expect(lsFetch.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-GitLab-Editor-Telemetry': '1' }),
        }),
      );
      await service.stop();
    });

    it('does not set X-GitLab-Editor-Telemetry header when instance does not support standard context', async () => {
      const service = new DefaultSnowplowService(
        lsFetch,
        configService,
        makeApiService('18.11.0'),
        logger,
      );
      await service.trackStructuredEvent({ category: 'test', action: 'test' }, []);
      jest.runAllTimers();

      expect(lsFetch.post).toHaveBeenCalled();
      const callHeaders = jest.mocked(mockPost).mock.calls[0][1].headers;
      expect(callHeaders).not.toHaveProperty('X-GitLab-Editor-Telemetry');
      await service.stop();
    });

    it('sets Private-Token header for PAT tokens', async () => {
      const service = new DefaultSnowplowService(
        lsFetch,
        configService,
        makeApiService('19.0.0', { token: 'my-pat', type: 'pat', scopes: [] }),
        logger,
      );
      await service.trackStructuredEvent({ category: 'test', action: 'test' }, []);
      jest.runAllTimers();

      expect(lsFetch.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'Private-Token': 'my-pat' }),
        }),
      );
      await service.stop();
    });

    it('sets Authorization Bearer header for OAuth tokens', async () => {
      const service = new DefaultSnowplowService(
        lsFetch,
        configService,
        makeApiService('19.0.0', { token: 'my-oauth-token', type: 'oauth', scopes: [] }),
        logger,
      );
      await service.trackStructuredEvent({ category: 'test', action: 'test' }, []);
      jest.runAllTimers();

      expect(lsFetch.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer my-oauth-token' }),
        }),
      );
      await service.stop();
    });

    it('sends X-GitLab-Editor-Telemetry without auth header when no token is present', async () => {
      const service = new DefaultSnowplowService(
        lsFetch,
        configService,
        makeApiService('19.0.0'),
        logger,
      );
      await service.trackStructuredEvent({ category: 'test', action: 'test' }, []);
      jest.runAllTimers();

      expect(lsFetch.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-GitLab-Editor-Telemetry': '1' }),
        }),
      );
      const callHeaders = jest.mocked(mockPost).mock.calls[0][1].headers;
      expect(callHeaders).not.toHaveProperty('Private-Token');
      expect(callHeaders).not.toHaveProperty('Authorization');
      await service.stop();
    });

    it('does not send Private-Token header when instance does not support standard context', async () => {
      const service = new DefaultSnowplowService(
        lsFetch,
        configService,
        makeApiService('18.11.0', { token: 'my-pat', type: 'pat', scopes: [] }),
        logger,
      );
      await service.trackStructuredEvent({ category: 'test', action: 'test' }, []);
      jest.runAllTimers();

      const callHeaders = jest.mocked(mockPost).mock.calls[0][1].headers;
      expect(callHeaders).not.toHaveProperty('Private-Token');
      expect(callHeaders).not.toHaveProperty('Authorization');
      await service.stop();
    });

    it('does not send Authorization header when instance does not support standard context', async () => {
      const service = new DefaultSnowplowService(
        lsFetch,
        configService,
        makeApiService('18.11.0', { token: 'my-oauth-token', type: 'oauth', scopes: [] }),
        logger,
      );
      await service.trackStructuredEvent({ category: 'test', action: 'test' }, []);
      jest.runAllTimers();

      const callHeaders = jest.mocked(mockPost).mock.calls[0][1].headers;
      expect(callHeaders).not.toHaveProperty('Private-Token');
      expect(callHeaders).not.toHaveProperty('Authorization');
      await service.stop();
    });

    it('does not send auth headers when a custom tracking URL is configured', async () => {
      configService.set('telemetry.trackingUrl', 'https://custom.tracking.endpoint');
      const service = new DefaultSnowplowService(
        lsFetch,
        configService,
        makeApiService('19.0.0', { token: 'my-pat', type: 'pat', scopes: [] }),
        logger,
      );
      await service.trackStructuredEvent({ category: 'test', action: 'test' }, []);
      jest.runAllTimers();

      const callHeaders = jest.mocked(mockPost).mock.calls[0][1].headers;
      expect(callHeaders).not.toHaveProperty('Private-Token');
      expect(callHeaders).not.toHaveProperty('Authorization');
      await service.stop();
    });
  });

  describe('trackEvent', () => {
    beforeAll(() => {
      jest.mocked(Emitter).mockImplementation((...args: ConstructorParameters<typeof Emitter>) => {
        const RealEmitter = jest.requireActual('./emitter').Emitter;
        return new RealEmitter(...args);
      });
    });

    const mockStructEvent = {
      category: 'test',
      action: 'test',
      label: 'test',
      value: 1,
    };

    beforeEach(() => {
      mockPost.mockReset();
    });

    it('should send the events to Snowplow when enabled', async () => {
      configService.set('telemetry.enabled', true);
      jest.mocked(mockPost).mockResolvedValueOnce({ status: 200 });
      await snowplowService.trackStructuredEvent(mockStructEvent, []);
      jest.runAllTimers();
      expect(lsFetch.post).toHaveBeenCalled();
      await snowplowService.stop();
    });

    it('should not send events to Snowplow when disabled', async () => {
      configService.set('telemetry.enabled', false);
      jest.mocked(mockPost).mockResolvedValueOnce({ status: 200 });
      await snowplowService.trackStructuredEvent(mockStructEvent, []);
      jest.runAllTimers();
      expect(lsFetch.post).not.toHaveBeenCalled();
      await snowplowService.stop();
    });

    it('should disable sending events when hostname cannot be resolved', async () => {
      configService.set('telemetry.enabled', true);

      jest.mocked(mockPost).mockClear();
      jest.mocked(mockPost).mockRejectedValueOnce({
        message: '',
        errno: 'ENOTFOUND',
      });

      await snowplowService.trackStructuredEvent(mockStructEvent, []);
      jest.runAllTimers();

      await snowplowService.stop();

      expect(logger.infoLogs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              'Disabling telemetry, unable to resolve endpoint address.',
            ),
          }),
        ]),
      );

      logger.clear();
      await snowplowService.trackStructuredEvent(mockStructEvent, []);

      expect(logger.infoLogs).toEqual([]);
    });
  });
});
