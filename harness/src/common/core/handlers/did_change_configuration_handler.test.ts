import { LOG_LEVEL, TestLogger } from '@gitlab-org/logging';
import { ConfigService, DefaultConfigService, ClientConfig } from '@gitlab-org/config';
import { DefaultDidChangeConfigurationHandler } from './did_change_configuration_handler';

describe('DidChangeConfigurationHandler', () => {
  let configService: ConfigService;
  let handler: DefaultDidChangeConfigurationHandler;
  let logger: TestLogger;

  beforeEach(() => {
    configService = new DefaultConfigService();

    logger = new TestLogger();

    handler = new DefaultDidChangeConfigurationHandler(configService, logger);
  });

  it('passes client config to ConfigService', async () => {
    const expectedConfig: ClientConfig = {
      baseUrl: 'https://test.url',
      codeCompletion: {
        enableSecretRedaction: false,
      },
      telemetry: {
        enabled: false,
        trackingUrl: 'https://telemetry.url',
      },
      logLevel: LOG_LEVEL.DEBUG,
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
    };
    await handler.notificationHandler({
      settings: expectedConfig,
    });

    expect(configService.get()).toEqual(expectedConfig);
  });

  it('validates the new configuration', async () => {
    await handler.notificationHandler({
      settings: {
        codeCompletion: {
          enabled: 'a',
          enableSecretRedaction: 'b',
          additionalLanguages: [1],
          disabledSupportedLanguages: [true],
        } as unknown as ClientConfig['codeCompletion'],
      },
    });
    expect(logger.errorLogs[0].message).toContain('The configuration is not valid');
    const errorMessage = (logger.errorLogs[0].error as { message: string })?.message;
    expect(errorMessage).toContain(
      'settings.codeCompletion: Invalid input: expected boolean, received string at "enabled"; Invalid input: expected boolean, received string at "enableSecretRedaction"; Invalid input: expected string, received number at "additionalLanguages[0]"; Invalid input: expected string, received boolean at "disabledSupportedLanguages[0]"',
    );
    expect(errorMessage).toContain(
      'Config received {"enabled":"a","enableSecretRedaction":"b","additionalLanguages":[1],"disabledSupportedLanguages":[true]}',
    );
    expect(errorMessage).toContain(
      'Example of a correct format: {"enabled":true,"enableSecretRedaction":true,"additionalLanguages":["clojure"],"disabledSupportedLanguages":["handlebars"]}',
    );
  });

  describe('when authentication token is reset', () => {
    beforeEach(() => {
      configService.merge({ token: 'existing-token' });
    });

    it('logs a warning when token is removed', async () => {
      await handler.notificationHandler({
        settings: {
          token: '',
        },
      });

      expect(logger.warnLogs).toHaveLength(1);
      expect(logger.warnLogs[0].message).toContain('Client has reset authentication token.');
    });

    it('logs a warning when token is set to null', async () => {
      await handler.notificationHandler({
        settings: {
          token: null as unknown as string,
        },
      });

      expect(logger.warnLogs).toHaveLength(1);
      expect(logger.warnLogs[0].message).toContain('Client has reset authentication token.');
    });

    it('does not log a warning when token is not in settings', async () => {
      await handler.notificationHandler({
        settings: {
          baseUrl: 'https://new.url',
        },
      });

      expect(logger.warnLogs).toHaveLength(0);
    });

    it('does not log a warning when token is updated to a new value', async () => {
      await handler.notificationHandler({
        settings: {
          token: 'new-token',
        },
      });

      expect(logger.warnLogs).toHaveLength(0);
    });
  });
});
