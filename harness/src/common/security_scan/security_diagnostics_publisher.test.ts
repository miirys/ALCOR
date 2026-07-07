import { TextDocument } from 'vscode-languageserver-textdocument';
import { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { createFakePartial, createFakeResponse } from '@gitlab-org/test-utils';
import { FetchError, ApiRequest, FeatureFlagService } from '@gitlab-org/core';
import { ConfigService, DefaultConfigService } from '@gitlab-org/config';
import { DefaultDocumentService, DocumentService } from '../document_service';
import { GitLabApiClient } from '../api';
import { REMOTE_SECURITY_SCAN, REMOTE_SECURITY_SCAN_RESPONSE_NOTIFICATION } from '../notifications';
import { DuoProjectAccessChecker } from '../services/duo_access';
import { DuoProjectStatus } from '../services/duo_access/project_access_checker';
import { DuoProject } from '../services/duo_access/workspace_project_access_cache';
import {
  SECURITY_DIAGNOSTICS_EVENT,
  SecurityDiagnosticsTracker,
} from '../tracking/security_scan/security_diagnostics_tracker';
import { log } from '../log';
import {
  ApiErrorMessageMapping,
  DefaultSecurityDiagnosticsPublisher,
  SecurityDiagnosticsPublisher,
} from './security_diagnostics_publisher';
import { DefaultSecurityScanNotifier, SecurityScanNotifier } from './security_notifier';

const workspaceFolders: WorkspaceFolder[] = [
  {
    uri: 'file:///mygroup/myproject',
    name: 'testWorkspaceFolder',
  },
];

const errorMessage = 'SecurityScan: failed to run security scan';

describe('SecurityDiagnosticsPublisher', () => {
  jest.useFakeTimers();

  let api: GitLabApiClient;
  let configService: ConfigService;
  let featureFlagService: FeatureFlagService;

  let documentService: DocumentService;

  let securityScanNotifier: SecurityScanNotifier;

  let securityDiagnosticsPublisher: SecurityDiagnosticsPublisher;

  let duoProjectAccessChecker: DuoProjectAccessChecker;

  let securityScanTracker: SecurityDiagnosticsTracker;

  let mockFetchFromApi: jest.Mock;
  let publish: jest.Mock;
  let notify: jest.Mock;

  const configureSecurityScanner = (enabled: boolean) => {
    configService.merge({
      securityScannerOptions: {
        enabled,
      },
    });
  };

  const simulateCustomNotification = () => {
    const textDocument = TextDocument.create(
      'file:///mygroup/myproject/test.c',
      'c',
      1,
      'int main() { return 0; }',
    );
    jest.mocked(documentService.getDocument).mockReturnValue(textDocument);
    securityDiagnosticsPublisher.handleScanNotification({
      documentUri: textDocument.uri,
      source: 'command',
    });
  };

  const expectSuccessfulPOSTCall = () => {
    const [request] = mockFetchFromApi.mock.calls[0];
    expect(request).toBeDefined();
    const { type, method, path, body } = request || {};
    expect(type).toBe('rest');
    expect(method).toBe('POST');
    expect(body).toBeDefined();
    expect(path).toEqual('/api/v4/projects/mygroup%2Fmyproject/security_scans/sast/scan');
  };

  const expectFetchedData = () => {
    expect(publish).toHaveBeenCalledTimes(1);
    const { uri, diagnostics } = publish.mock.calls[0][0];
    expect(uri).toBe('file:///mygroup/myproject/test.c');
    expect(diagnostics).toHaveLength(1);
    const diagnostic = diagnostics[0];
    expect(diagnostic.message).toBe('Some Vulnerability\n\nThis is some vulnerability');
  };

  beforeEach(async () => {
    api = createFakePartial<GitLabApiClient>({
      fetchFromApi: jest.fn(),
      onApiReconfigured: jest.fn(),
    });
    configService = new DefaultConfigService();
    featureFlagService = createFakePartial<FeatureFlagService>({
      isClientFlagEnabled: jest.fn(),
    });
    documentService = createFakePartial<DefaultDocumentService>({
      onDocumentChange: jest.fn(),
      getDocument: jest.fn(),
    });
    securityScanNotifier = new DefaultSecurityScanNotifier();

    duoProjectAccessChecker = createFakePartial<DuoProjectAccessChecker>({
      checkProjectStatus: jest.fn(),
    });

    securityScanTracker = createFakePartial<SecurityDiagnosticsTracker>({
      trackEvent: jest.fn(),
    });

    securityDiagnosticsPublisher = new DefaultSecurityDiagnosticsPublisher(
      api,
      featureFlagService,
      configService,
      documentService,
      securityScanNotifier,
      duoProjectAccessChecker,
      securityScanTracker,
    );
    // simulate initialization done by ConnectionService
    publish = jest.fn();
    notify = jest.fn();
    securityDiagnosticsPublisher.init(publish);
    securityScanNotifier.init(notify);
    mockFetchFromApi = jest.mocked(api.fetchFromApi);

    configService.set('workspaceFolders', workspaceFolders);

    jest.spyOn(log, 'warn');
  });

  describe('when feature is disabled', () => {
    beforeEach(async () => {
      jest.mocked(featureFlagService.isClientFlagEnabled).mockReturnValue(false);
      configureSecurityScanner(true);
    });

    it(`${REMOTE_SECURITY_SCAN} notification: is not called`, () => {
      simulateCustomNotification();
      expect(mockFetchFromApi).toHaveBeenCalledTimes(0);
    });
  });

  describe('when disabled with config', () => {
    beforeEach(async () => {
      jest.mocked(featureFlagService.isClientFlagEnabled).mockReturnValue(true);
      configureSecurityScanner(false);
    });

    it(`${REMOTE_SECURITY_SCAN} notification: is not called`, () => {
      simulateCustomNotification();
      expect(mockFetchFromApi).toHaveBeenCalledTimes(0);
    });
  });

  describe('when feature is enabled', () => {
    beforeEach(async () => {
      jest.mocked(featureFlagService.isClientFlagEnabled).mockReturnValue(true);
      configureSecurityScanner(true);
    });

    describe('fetchApi', () => {
      beforeEach(async () => {
        mockFetchFromApi = jest.mocked(api.fetchFromApi);
        mockFetchFromApi.mockResolvedValue({
          vulnerabilities: [
            {
              name: 'Some Vulnerability',
              description: 'This is some vulnerability',
              severity: 'high',
              location: { start_line: 1, end_line: 1 },
            },
          ],
        });
      });
      describe('when project path is not set', () => {
        beforeEach(async () => {
          jest.mocked(duoProjectAccessChecker.checkProjectStatus).mockReturnValue({
            status: DuoProjectStatus.NonGitlabProject,
          });
        });

        it(`${REMOTE_SECURITY_SCAN} notification: is not called`, () => {
          simulateCustomNotification();
          expect(mockFetchFromApi).toHaveBeenCalledTimes(0);
        });

        it(`${REMOTE_SECURITY_SCAN_RESPONSE_NOTIFICATION} error notification: is called`, () => {
          simulateCustomNotification();
          expect(notify).toHaveBeenCalledWith({
            filePath: 'file:///mygroup/myproject/test.c',
            timestamp: expect.any(Number),
            status: 500,
            error: 'Real-time SAST scan failed. No valid project detected.',
          });
        });
      });

      describe('when project path is set', () => {
        beforeEach(async () => {
          jest.mocked(duoProjectAccessChecker.checkProjectStatus).mockReturnValue({
            project: createFakePartial<DuoProject>({
              namespaceWithPath: 'mygroup/myproject',
            }),
            status: DuoProjectStatus.DuoEnabled,
          });

          simulateCustomNotification();
        });

        it('tracks event on scan started with scan source', async () => {
          expect(securityScanTracker.trackEvent).toHaveBeenCalledWith(
            SECURITY_DIAGNOSTICS_EVENT.SCAN_INITIATED,
            {
              source: 'command',
            },
          );
        });

        it('is called', async () => {
          expect(mockFetchFromApi).toHaveBeenCalledTimes(1);
        });

        it('should POST to the configured URL', async () => {
          expectSuccessfulPOSTCall();
        });

        it('is called with fetched data', async () => {
          expectFetchedData();
        });

        it('should send a notification with response', async () => {
          expect(notify).toHaveBeenCalledTimes(1);
          const { vulnerabilities } = await mockFetchFromApi.mock.results[0].value;
          const { body } = await mockFetchFromApi.mock.calls[0][0];
          const { filePath, results, status } = notify.mock.calls[0][0];
          expect(filePath).toBe(body.file_path);
          expect(results).toBe(vulnerabilities);
          expect(status).toBe(200);
        });
      });
    });

    describe('error handling', () => {
      beforeEach(async () => {
        jest.mocked(duoProjectAccessChecker.checkProjectStatus).mockReturnValue({
          project: createFakePartial<DuoProject>({
            namespaceWithPath: 'mygroup/myproject',
          }),
          status: DuoProjectStatus.DuoEnabled,
        });
      });

      it('handles FetchError correctly', async () => {
        const errorResponse = createFakeResponse({
          url: 'https://example.com/api/v4/scan',
          status: 404,
          text: 'Not found',
        });
        const request = createFakePartial<ApiRequest<unknown>>({});
        const fetchError = new FetchError(request, errorResponse, 'SAST security scan');
        mockFetchFromApi.mockRejectedValue(fetchError);
        simulateCustomNotification();

        const { body } = await mockFetchFromApi.mock.calls[0][0];

        expect(log.warn).toHaveBeenCalledWith(errorMessage, fetchError);

        expect(notify).toHaveBeenCalledWith({
          filePath: body.file_path,
          timestamp: expect.any(Number),
          status: fetchError.status,
          error: ApiErrorMessageMapping[fetchError.status],
        });
      });

      it('handles FetchError with fallback message correctly', async () => {
        const errorResponse = createFakeResponse({
          url: 'https://example.com/api/v4/scan',
          status: 400,
          text: 'Bad request',
        });
        const request = createFakePartial<ApiRequest<unknown>>({});
        const fetchError = new FetchError(request, errorResponse, 'SAST security scan');
        mockFetchFromApi.mockRejectedValue(fetchError);
        simulateCustomNotification();

        const { body } = await mockFetchFromApi.mock.calls[0][0];

        expect(log.warn).toHaveBeenCalledWith(errorMessage, fetchError);

        expect(notify).toHaveBeenCalledWith({
          filePath: body.file_path,
          timestamp: expect.any(Number),
          status: fetchError.status,
          error: ApiErrorMessageMapping[500],
        });
      });

      it('handles non-fetch errors correctly', async () => {
        const error = new Error('some generic error');
        mockFetchFromApi.mockRejectedValue(error);
        simulateCustomNotification();

        const { body } = await mockFetchFromApi.mock.calls[0][0];

        expect(log.warn).toHaveBeenCalledWith(errorMessage, error);
        expect(notify).toHaveBeenCalledWith({
          filePath: body.file_path,
          timestamp: expect.any(Number),
          status: 500,
          error: 'some generic error',
        });
      });

      it('handles missing workspaceFolder', async () => {
        configService.set('workspaceFolders', []);
        simulateCustomNotification();
        const error = new Error('Real-time SAST scan failed. No valid workspace detected.');
        expect(log.warn).toHaveBeenCalledWith(errorMessage, error);
        expect(notify).toHaveBeenCalledWith({
          filePath: 'file:///mygroup/myproject/test.c',
          timestamp: expect.any(Number),
          status: 500,
          error: error.message,
        });
      });
    });
  });
});
