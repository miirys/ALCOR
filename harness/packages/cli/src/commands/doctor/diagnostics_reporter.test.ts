import { describe, expect, it, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { GitLabApiService, UserService } from '@gitlab-org/core';
import type { ConfigService } from '@gitlab-org/config';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import { FeatureStateValidator } from '@gitlab-org/feature-state';
import type { McpServerApprovalStore } from '@gitlab-org/ai-configuration';
import type { RuntimeContext } from '../../runtime_context';
import { CredentialProvider } from '../../utils/credential_provider';
import { DefaultDiagnosticsReporter } from './diagnostics_reporter';

describe('DefaultDiagnosticsReporter', () => {
  it('produces a non-empty markdown report and runs the SecretRedactor pass', async () => {
    const runtimeContext = createFakePartial<RuntimeContext>({
      cliVersion: '0.0.0',
      envInfo: createFakePartial<RuntimeContext['envInfo']>({
        terminalName: '',
        isKittyProtocolSupported: false,
        distribution: 'npm',
        osPlatform: 'darwin',
        osVersion: '0',
      }),
    });
    const configService = createFakePartial<ConfigService>({
      get: (() => ({})) as ConfigService['get'],
    });
    const apiService = createFakePartial<GitLabApiService>({});
    const userService = createFakePartial<UserService>({});
    const credentialProvider = createFakePartial<CredentialProvider>({
      getCredentials: jest.fn<CredentialProvider['getCredentials']>().mockResolvedValue({
        token: '',
        baseUrl: 'https://gitlab.com',
        source: { type: 'none' },
      }),
    });
    const featureStateValidator = createFakePartial<FeatureStateValidator>({
      validate: jest.fn<FeatureStateValidator['validate']>().mockResolvedValue([]),
    });
    const secretRedactor = createFakePartial<SecretRedactor>({
      redactSecrets: jest.fn<SecretRedactor['redactSecrets']>().mockImplementation((raw) => raw),
    });
    const mcpServerApprovalStore = createFakePartial<McpServerApprovalStore>({
      list: jest.fn<McpServerApprovalStore['list']>().mockResolvedValue([]),
    });

    const reporter = new DefaultDiagnosticsReporter(
      runtimeContext,
      configService,
      apiService,
      userService,
      credentialProvider,
      featureStateValidator,
      secretRedactor,
      mcpServerApprovalStore,
    );

    const report = await reporter.report();

    expect(report.length).toBeGreaterThan(0);
    expect(secretRedactor.redactSecrets).toHaveBeenCalled();
  });
});
