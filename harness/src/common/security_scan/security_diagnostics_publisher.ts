import {
  DiagnosticSeverity,
  DocumentUri,
  NotificationHandler,
  WorkspaceFolder,
  type Diagnostic,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Injectable, createInterfaceId } from '@gitlab/needle';
import {
  GitLabApiService,
  ApiRequest,
  isFetchError,
  ClientFeatureFlags,
  FeatureFlagService,
} from '@gitlab-org/core';
import { ConfigService, ClientConfig, ISecurityScannerOptions } from '@gitlab-org/config';
import { parseURIString } from '@gitlab-org/fs';
import { DefaultDocumentService, DocumentService } from '../document_service';
import { log } from '../log';
import { DiagnosticsPublisher, DiagnosticsPublisherFn } from '../diagnostics_publisher';
import { RemoteSecurityScanNotificationParam } from '../notifications';
import { DuoProjectAccessChecker } from '../services/duo_access';
import {
  SECURITY_DIAGNOSTICS_EVENT,
  SecurityDiagnosticsTracker,
} from '../tracking/security_scan/security_diagnostics_tracker';
import { SecurityScanNotifier } from './security_notifier';
import { SecurityScanClientResponse, Vulnerability } from './types';

// error code for unknown error
const UNKNOWN_ERROR_CODE = 500;
export const ApiErrorMessageMapping: Record<number, string> = {
  401: 'Real-time SAST scan authentication failed. Your GitLab authentication token is invalid or has expired. Reauthenticate with your GitLab account or generate a new personal access token.',
  403: 'Real-time SAST scan is not available for this project or [namespace](https://docs.gitlab.com/user/namespace/).',
  404: 'Real-time SAST scan is not available on your [GitLab instance version](https://docs.gitlab.com/api/projects/#real-time-security-scan).',
  [UNKNOWN_ERROR_CODE]:
    'Real-time SAST scan failed with an unknown error. Check your network connection, reload your IDE, and try again ',
};

interface SecurityScanResponse {
  vulnerabilities: Vulnerability[];
}

export interface SecurityDiagnosticsPublisher extends DiagnosticsPublisher {
  handleScanNotification: NotificationHandler<RemoteSecurityScanNotificationParam>;
}

export const SecurityDiagnosticsPublisher = createInterfaceId<SecurityDiagnosticsPublisher>(
  'SecurityDiagnosticsPublisher',
);

@Injectable(SecurityDiagnosticsPublisher, [
  GitLabApiService,
  FeatureFlagService,
  ConfigService,
  DocumentService,
  SecurityScanNotifier,
  DuoProjectAccessChecker,
  SecurityDiagnosticsTracker,
])
export class DefaultSecurityDiagnosticsPublisher implements SecurityDiagnosticsPublisher {
  #publish: DiagnosticsPublisherFn | undefined;

  #opts?: ISecurityScannerOptions;

  #api: GitLabApiService;

  #featureFlagService: FeatureFlagService;

  #securityScanNotifier: SecurityScanNotifier;

  #securityScanTracker: SecurityDiagnosticsTracker;

  #documentService: DocumentService;

  #duoProjectAccessChecker: DuoProjectAccessChecker;

  #workspaceFolders: WorkspaceFolder[];

  constructor(
    api: GitLabApiService,
    featureFlagService: FeatureFlagService,
    configService: ConfigService,
    documentService: DocumentService,
    securityScanNotifier: SecurityScanNotifier,
    duoProjectAccessChecker: DuoProjectAccessChecker,
    securityScanTracker: SecurityDiagnosticsTracker,
  ) {
    this.#api = api;
    this.#featureFlagService = featureFlagService;
    this.#documentService = documentService;
    this.#securityScanNotifier = securityScanNotifier;
    this.#duoProjectAccessChecker = duoProjectAccessChecker;
    this.#workspaceFolders = configService.get('workspaceFolders') || [];
    this.#securityScanTracker = securityScanTracker;

    configService.onConfigChange((config: ClientConfig) => {
      this.#opts = config.securityScannerOptions;
      this.#workspaceFolders = config.workspaceFolders || [];
    });
  }

  init(callback: DiagnosticsPublisherFn): void {
    this.#publish = callback;
  }

  async handleScanNotification(params: RemoteSecurityScanNotificationParam): Promise<void> {
    this.#securityScanTracker.trackEvent(SECURITY_DIAGNOSTICS_EVENT.SCAN_INITIATED, {
      source: params.source,
    });
    await this.#runSecurityScan(params.documentUri);
  }

  async #runSecurityScan(documentSource: TextDocument | DocumentUri) {
    let filePath;
    try {
      const document = DefaultDocumentService.isTextDocument(documentSource)
        ? documentSource
        : this.#documentService.getDocument(documentSource);
      if (!document) return;

      const workspaceFolder = this.#workspaceFolders.find((wf) => document.uri.startsWith(wf.uri));
      if (!workspaceFolder) {
        throw new Error('Real-time SAST scan failed. No valid workspace detected.');
      }
      const { project } = this.#duoProjectAccessChecker.checkProjectStatus(
        document.uri,
        workspaceFolder,
      );

      if (!project?.namespaceWithPath) {
        throw new Error('Real-time SAST scan failed. No valid project detected.');
      }

      if (!this.#publish) {
        this.#logError('The DefaultSecurityService has not been initialized. Call init first.');
        throw new Error('Real-time SAST scan failed. Reload your IDE, and try again');
      }
      if (!this.#featureFlagService.isClientFlagEnabled(ClientFeatureFlags.RemoteSecurityScans)) {
        return;
      }
      if (!this.#opts?.enabled) {
        return;
      }
      if (!this.#opts) {
        return;
      }

      filePath = parseURIString(document.uri).path;
      const content = document.getText();
      const encodedProjectPath = encodeURIComponent(project.namespaceWithPath);
      const path = `/api/v4/projects/${encodedProjectPath}/security_scans/sast/scan`;
      const securityScanRequest: ApiRequest<SecurityScanResponse> = {
        type: 'rest',
        method: 'POST',
        path,
        body: {
          file_path: filePath,
          content,
        },
        supportedSinceInstanceVersion: {
          resourceName: 'SAST security scan',
          version: '17.5.0',
        },
      };

      log.debug(`SecurityScan: scanning contents of "${filePath}"...`);
      const response: SecurityScanResponse = await this.#api.fetchFromApi(securityScanRequest);

      const vulns = response.vulnerabilities;

      if (vulns == null || !Array.isArray(vulns)) {
        return;
      }

      const diagnostics: Diagnostic[] = vulns.map(this.#mapVulnerabilityToDiagnostic);

      await this.#publish({
        uri: document.uri,
        diagnostics,
      });

      const notificationResponse: SecurityScanClientResponse = {
        filePath,
        status: 200,
        results: vulns,
        timestamp: Date.now(),
      };

      await this.#securityScanNotifier.sendScanResponse(notificationResponse);
    } catch (error) {
      await this.#handleError(error, filePath ?? documentSource.toString());
    }
  }

  #mapVulnerabilityToDiagnostic(vuln: Vulnerability) {
    const message = `${vuln.name}\n\n${vuln.description}`;
    const severity =
      vuln.severity === 'high' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning;

    return {
      message,
      range: {
        start: {
          line: vuln.location.start_line - 1,
          character: vuln.location.start_column - 1,
        },
        end: {
          line: vuln.location.end_line - 1,
          character: vuln.location.end_column - 1,
        },
      },
      severity,
      source: 'gitlab_security_scan',
    };
  }

  #logError(error: unknown): void {
    log.warn('SecurityScan: failed to run security scan', error);
  }

  async #handleError(error: unknown, filePath: string): Promise<void> {
    this.#logError(error);
    // TODO: remove status from SecurityScanClientResponse
    const status = isFetchError(error) ? error.status : UNKNOWN_ERROR_CODE;

    let errorMessage: string | unknown;
    if (isFetchError(error)) {
      errorMessage = ApiErrorMessageMapping[status] ?? ApiErrorMessageMapping[UNKNOWN_ERROR_CODE];
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    const response: SecurityScanClientResponse = {
      filePath,
      timestamp: Date.now(),
      status,
      error: errorMessage ?? ApiErrorMessageMapping[UNKNOWN_ERROR_CODE],
    };

    await this.#securityScanNotifier.sendScanResponse(response);
  }
}
