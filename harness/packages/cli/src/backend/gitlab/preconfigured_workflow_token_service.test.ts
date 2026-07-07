import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { WorkflowType } from '@gitlab-lsp/workflow-api';
import type { GenerateTokenResponse, WorkflowRailsService } from '@gitlab-org/workflow-executor';
import type { CredentialProvider, Credentials } from '../../utils/credential_provider';
import type { GitLabParsedOptions } from './gitlab_parsed_options';
import { PreConfiguredWorkflowTokenService } from './preconfigured_workflow_token_service';

function createMockToken(): GenerateTokenResponse {
  return createFakePartial<GenerateTokenResponse>({
    duo_workflow_service: {
      base_url: 'https://workflow.example.com',
      token: 'test-token',
      token_expires_at: Date.now() / 1000 + 3600,
      secure: true,
      headers: {},
    },
    gitlab_rails: {
      base_url: 'https://gitlab.example.com',
      token: 'rails-token',
      token_expires_at: new Date(Date.now() + 3600000).toISOString(),
    },
  });
}

describe('PreConfiguredWorkflowTokenService', () => {
  let service: PreConfiguredWorkflowTokenService;
  let logger: TestLogger;
  let mockCredentialProvider: CredentialProvider;
  let mockWorkflowRailsService: WorkflowRailsService;
  let mockCredentials: Credentials;

  describe('when options include pre-configured token fields', () => {
    let mockOpts: GitLabParsedOptions;

    beforeEach(() => {
      logger = new TestLogger();
      mockOpts = createFakePartial<GitLabParsedOptions>({
        duoWorkflowServiceServer: 'https://workflow.example.com',
        duoWorkflowServiceToken: 'preconfigured-token',
      });
      mockCredentials = createFakePartial<Credentials>({
        token: 'test-gitlab-token',
        baseUrl: 'https://gitlab.example.com',
      });
      mockCredentialProvider = createFakePartial<CredentialProvider>({
        getCredentials: jest.fn<() => Promise<Credentials>>().mockResolvedValue(mockCredentials),
      });
      mockWorkflowRailsService = createFakePartial<WorkflowRailsService>({
        revokeWorkflowToken: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      });

      service = new PreConfiguredWorkflowTokenService(
        logger,
        mockOpts,
        mockCredentialProvider,
        mockWorkflowRailsService,
      );
    });

    describe('getToken', () => {
      it('builds and returns a workflow token from credentials', async () => {
        const result = await service.getToken('workflow-1', WorkflowType.SOFTWARE_DEVELOPMENT);

        expect(result.duo_workflow_service.token).toBe('preconfigured-token');
        expect(result.gitlab_rails.token).toBe('test-gitlab-token');
      });

      describe('when getting token after the service has been disposed', () => {
        it('throws an error', async () => {
          service.dispose();

          await expect(service.getToken('workflow-1')).rejects.toThrow(
            'Token service has been disposed',
          );
        });
      });
    });

    describe('revokeToken', () => {
      it('revokes the token via the rails service', async () => {
        const mockToken = createMockToken();

        await service.revokeToken('workflow-1', mockToken);

        expect(mockWorkflowRailsService.revokeWorkflowToken).toHaveBeenCalledWith(mockToken);
      });

      describe('when revocation fails', () => {
        beforeEach(() => {
          (
            mockWorkflowRailsService.revokeWorkflowToken as jest.Mock<() => Promise<void>>
          ).mockRejectedValue(new Error('Network error'));
        });

        it('does not throw', async () => {
          await expect(
            service.revokeToken('workflow-1', createMockToken()),
          ).resolves.toBeUndefined();
        });
      });
    });
  });

  describe('when opts are missing pre-configured token fields', () => {
    beforeEach(() => {
      logger = new TestLogger();
      const mockOpts = createFakePartial<GitLabParsedOptions>({});
      mockCredentials = createFakePartial<Credentials>({
        token: 'test-gitlab-token',
        baseUrl: 'https://gitlab.example.com',
      });
      mockCredentialProvider = createFakePartial<CredentialProvider>({
        getCredentials: jest.fn<() => Promise<Credentials>>().mockResolvedValue(mockCredentials),
      });
      mockWorkflowRailsService = createFakePartial<WorkflowRailsService>({
        revokeWorkflowToken: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      });

      service = new PreConfiguredWorkflowTokenService(
        logger,
        mockOpts,
        mockCredentialProvider,
        mockWorkflowRailsService,
      );
    });

    describe('getToken', () => {
      it('throws when tryBuildWorkflowToken returns undefined', async () => {
        await expect(service.getToken('workflow-1')).rejects.toThrow(
          'Expected workflow token to be present in headless CI mode. This is a bug.',
        );
      });
    });
  });
});
