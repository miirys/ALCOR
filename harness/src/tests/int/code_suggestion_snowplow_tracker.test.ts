import { EVENT_VALIDATION_ERROR_MSG } from '@gitlab-org/telemetry';
import { TELEMETRY_DISABLED_WARNING_MSG } from '../../common/tracking/code_suggestions/constants';
import { IClientContext } from '../../common/tracking';
import { GITLAB_TEST_TOKEN, DEFAULT_INITIALIZE_PARAMS, LspClient } from './lsp_client';

describe('Snowplow Tracker', () => {
  let lsClient: LspClient;

  const sendAutocompletionRequest = async (
    clientContext: IClientContext,
    telemetryEnabled: boolean = true,
  ) => {
    await lsClient.sendInitialize({
      ...DEFAULT_INITIALIZE_PARAMS,
      initializationOptions: {
        ...clientContext,
      },
    });

    await lsClient.sendDidChangeConfiguration({
      settings: {
        token: GITLAB_TEST_TOKEN,
        telemetry: { trackingUrl: 'http://127.0.0.1:9091', enabled: telemetryEnabled },
      },
    });
    await lsClient.sendInitialized();
    await lsClient.sendTextDocumentDidOpen(
      'file://base/path/foo.cs',
      'csharp',
      0,
      'namespace Bar {\n\tpublic class Foo {\n\t}\n}',
    );

    await lsClient.sendTextDocumentCompletion('file://base/path/foo.cs', 2, 16);
  };

  beforeEach(() => {
    lsClient = new LspClient(GITLAB_TEST_TOKEN);
  });

  afterEach(() => {
    lsClient.childProcessConsole = [];
  });

  const validClientContext = {
    ide: { name: 'IDE', version: '1.0', vendor: 'Vendor' },
    extension: { name: 'Extension', version: '1.0' },
  };

  describe('When telemetry is disabled', () => {
    it('should NOT track event', async () => {
      try {
        await sendAutocompletionRequest(validClientContext, false);
        expect(lsClient.childProcessConsole).toEqual(
          expect.arrayContaining([expect.stringContaining(TELEMETRY_DISABLED_WARNING_MSG)]),
        );
      } finally {
        lsClient.dispose();
      }
    });
  });

  describe('Schema validation', () => {
    it('should track event with valid context', async () => {
      try {
        await sendAutocompletionRequest(validClientContext);

        expect(lsClient.childProcessConsole).not.toEqual(
          expect.arrayContaining([
            expect.stringContaining(TELEMETRY_DISABLED_WARNING_MSG),
            expect.stringContaining(EVENT_VALIDATION_ERROR_MSG),
          ]),
        );
      } finally {
        lsClient.dispose();
      }
    });

    it('should track the events when context is empty', async () => {
      try {
        await sendAutocompletionRequest({
          ide: undefined,
          extension: undefined,
        });
        expect(lsClient.childProcessConsole).not.toEqual(
          expect.arrayContaining([
            expect.stringContaining(TELEMETRY_DISABLED_WARNING_MSG),
            expect.stringContaining(EVENT_VALIDATION_ERROR_MSG),
          ]),
        );
      } finally {
        lsClient.dispose();
      }
    });

    it('should NOT track event with invalid context', async () => {
      try {
        /* eslint-disable  @typescript-eslint/no-explicit-any */
        await sendAutocompletionRequest({
          ide: { name: 'IDE', version: 2, vendor: 2 },
          extension: { name: 3, version: 4 },
        } as any);

        expect(lsClient.childProcessConsole).not.toEqual(
          expect.arrayContaining([expect.stringContaining(TELEMETRY_DISABLED_WARNING_MSG)]),
        );
        expect(lsClient.childProcessConsole).toEqual(
          expect.arrayContaining([expect.stringContaining(EVENT_VALIDATION_ERROR_MSG)]),
        );
      } finally {
        lsClient.dispose();
      }
    });
  });
});
