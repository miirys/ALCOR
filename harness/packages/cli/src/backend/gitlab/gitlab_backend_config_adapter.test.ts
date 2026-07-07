import { GitLabBackendConfigAdapter } from './gitlab_backend_config_adapter';
import {
  type GitLabParsedOptions,
  tryBuildWorkflowToken,
  validateCiTokenConfiguration,
} from './gitlab_parsed_options';

describe('GitLabBackendConfigAdapter', () => {
  describe('parseOptions', () => {
    describe('when model option is provided', () => {
      it('parses the model option', () => {
        const adapter = new GitLabBackendConfigAdapter();
        const allOpts = { model: 'anthropic/claude-sonnet-4-20250514' };
        const result = adapter.parseOptions(allOpts);
        expect(result.model).toBe('anthropic/claude-sonnet-4-20250514');
      });
    });

    describe('when connectionType option is provided', () => {
      it('parses connectionType without error (no-op, kept for backwards compatibility)', () => {
        const adapter = new GitLabBackendConfigAdapter();
        const allOpts = { connectionType: 'websocket', model: 'claude_sonnet_4_6' };
        const result = adapter.parseOptions(allOpts);
        expect(result.connectionType).toBe('websocket');
      });

      it('accepts grpc as a valid connectionType value', () => {
        const adapter = new GitLabBackendConfigAdapter();
        const allOpts = { connectionType: 'grpc' };
        const result = adapter.parseOptions(allOpts);
        expect(result.connectionType).toBe('grpc');
      });
    });
  });
});

describe('tryBuildWorkflowToken', () => {
  it('returns undefined when CI fields are not provided', () => {
    const parsed = {} as GitLabParsedOptions;
    const credentials = {
      token: 'token',
      baseUrl: 'https://example.com',
      source: { type: 'env-or-flag' as const },
    };
    expect(tryBuildWorkflowToken(parsed, credentials)).toBeUndefined();
  });

  it('builds token when CI fields are provided', () => {
    const parsed = {
      duoWorkflowServiceServer: 'https://workflow.example.com:443',
      duoWorkflowServiceToken: 'wf-token',
      insecure: 'false',
    } as GitLabParsedOptions;
    const credentials = {
      token: 'token',
      baseUrl: 'https://example.com',
      source: { type: 'env-or-flag' as const },
    };
    const result = tryBuildWorkflowToken(parsed, credentials);
    expect(result).toBeDefined();
    expect(result!.duo_workflow_service.base_url).toBe('https://workflow.example.com:443');
  });
});

describe('validateCiTokenConfiguration', () => {
  it('does not throw when no CI flags provided', () => {
    expect(() => validateCiTokenConfiguration({})).not.toThrow();
  });

  it('throws when only some CI flags provided', () => {
    expect(() =>
      validateCiTokenConfiguration({ duoWorkflowServiceServer: 'https://example.com' }),
    ).toThrow('all flags must be provided');
  });
});
