import { createInterfaceId, Injectable } from '@gitlab/needle';
import { GitLabApiService, UserService } from '@gitlab-org/core';
import { ConfigService } from '@gitlab-org/config';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import { FeatureStateValidator } from '@gitlab-org/feature-state';
import { McpServerApprovalStore } from '@gitlab-org/ai-configuration';
import { RuntimeContext } from '../../runtime_context';
import { CredentialProvider } from '../../utils/credential_provider';
import { joinSections } from './render_helpers';
import { sanitizeForReport } from './sanitize';
import { renderVersions } from './sections/versions';
import { renderAccount } from './sections/account';
import { renderProject } from './sections/project';
import { renderFeatures } from './sections/features';
import { renderSettings } from './sections/settings';
import { renderMcpApprovals } from './sections/mcp_approvals';

export interface DiagnosticsReporter {
  report(): Promise<string>;
}

export const DiagnosticsReporter = createInterfaceId<DiagnosticsReporter>('DiagnosticsReporter');

@Injectable(DiagnosticsReporter, [
  RuntimeContext,
  ConfigService,
  GitLabApiService,
  UserService,
  CredentialProvider,
  FeatureStateValidator,
  SecretRedactor,
  McpServerApprovalStore,
])
export class DefaultDiagnosticsReporter implements DiagnosticsReporter {
  #runtimeContext: RuntimeContext;

  #configService: ConfigService;

  #apiService: GitLabApiService;

  #userService: UserService;

  #credentialProvider: CredentialProvider;

  #featureStateValidator: FeatureStateValidator;

  #secretRedactor: SecretRedactor;

  #mcpServerApprovalStore: McpServerApprovalStore;

  constructor(
    runtimeContext: RuntimeContext,
    configService: ConfigService,
    apiService: GitLabApiService,
    userService: UserService,
    credentialProvider: CredentialProvider,
    featureStateValidator: FeatureStateValidator,
    secretRedactor: SecretRedactor,
    mcpServerApprovalStore: McpServerApprovalStore,
  ) {
    this.#runtimeContext = runtimeContext;
    this.#configService = configService;
    this.#apiService = apiService;
    this.#userService = userService;
    this.#credentialProvider = credentialProvider;
    this.#featureStateValidator = featureStateValidator;
    this.#secretRedactor = secretRedactor;
    this.#mcpServerApprovalStore = mcpServerApprovalStore;
  }

  async report(): Promise<string> {
    const credentials = await this.#credentialProvider.getCredentials();
    const featureStates = await this.#featureStateValidator.validate(this.#configService.get());
    const mcpApprovals = await renderMcpApprovals(this.#mcpServerApprovalStore);

    const sections = joinSections([
      '# ALCOR Doctor',
      renderVersions(this.#runtimeContext, this.#apiService.instanceInfo),
      renderAccount({
        credentials,
        tokenInfo: this.#apiService.tokenInfo,
        username: this.#userService.user?.username
          ? `@${this.#userService.user.username}`
          : undefined,
      }),
      renderProject(this.#configService),
      renderFeatures(featureStates),
      renderSettings(this.#configService.get()),
      mcpApprovals,
    ]);

    return sanitizeForReport(sections, this.#secretRedactor);
  }
}
