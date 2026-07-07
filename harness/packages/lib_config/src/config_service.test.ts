import { LOG_LEVEL } from '@gitlab-org/logging';
import { GITLAB_API_BASE_URL } from '@gitlab-org/core';
import { DefaultConfigService } from './config_service';

describe('ConfigService', () => {
  let service: DefaultConfigService;

  beforeEach(() => {
    service = new DefaultConfigService();
  });

  it('starts with default config', async () => {
    expect(service.get()).toEqual({
      baseUrl: GITLAB_API_BASE_URL,
      codeCompletion: {
        enableSecretRedaction: true,
      },
      telemetry: {
        enabled: true,
      },
      logLevel: LOG_LEVEL.INFO,
      ignoreCertificateErrors: false,
      httpAgentOptions: {},
      duo: {
        enabledWithoutGitlabProject: true,
      },
      notifications: {
        channel: 'auto',
      },
      featureFlagOverrides: {},
      knowledgeGraph: {},
    });
  });

  describe('setting property', () => {
    it('can set a property', async () => {
      const url = 'http://test.url';
      service.set('baseUrl', url);

      expect(service.get('baseUrl')).toBe(url);
    });

    it('triggers an event', async () => {
      const listener = jest.fn();
      service.onConfigChange(listener);
      const url = 'http://test.url';

      service.set('baseUrl', url);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ baseUrl: url }),
        expect.any(AbortSignal),
      );
    });
  });

  describe('merge config with partial config', () => {
    it('defined source values will override default config', async () => {
      service.merge({
        baseUrl: 'http://test.url',
        telemetry: { enabled: false },
      });

      expect(service.get('baseUrl')).toBe('http://test.url');
      expect(service.get('telemetry')).toEqual(expect.objectContaining({ enabled: false }));
    });

    it('keeps previous config when merging with empty config', () => {
      service.merge({
        telemetry: {
          baseUrl: 'test',
        },
      });

      service.merge({});

      expect(service.get('telemetry')).toEqual(
        expect.objectContaining({
          baseUrl: 'test',
        }),
      );
    });

    it('should keep previous configuration during partial updates', () => {
      // setting some initial configuration
      service.merge({
        telemetry: {
          baseUrl: 'test',
          enabled: false,
        },
      });

      // partially overriding the initial configuration
      service.merge({
        telemetry: {
          baseUrl: 'hello',
        },
      });

      expect(service.get('telemetry')).toEqual(
        expect.objectContaining({
          baseUrl: 'hello',
          enabled: false,
        }),
      );
    });

    it('triggers an event', async () => {
      const listener = jest.fn();
      service.onConfigChange(listener);
      const url = 'http://test.url';

      service.merge({
        baseUrl: url,
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ baseUrl: url }),
        expect.any(AbortSignal),
      );
    });

    it('should use source config values for arrays', async () => {
      service.set('codeCompletion.additionalLanguages', ['css']);
      expect(service.get('codeCompletion.additionalLanguages')).toContain('css');
      service.merge({
        codeCompletion: {
          additionalLanguages: [],
        },
      });

      expect(service.get('codeCompletion.additionalLanguages')).not.toContain('css');
    });

    it('should use default config values when value is missing in source config', () => {
      expect(service.get('baseUrl')).toBe(GITLAB_API_BASE_URL);
      service.merge({
        baseUrl: undefined,
      });

      expect(service.get('baseUrl')).toBe(GITLAB_API_BASE_URL);
    });
  });
});
