import { Logger, TestLogger } from '@gitlab-org/logging';
import { WorkflowType } from '@gitlab-lsp/workflow-api';
import { createFakePartial } from '@gitlab-org/test-utils';
import { getMockWorkflowToken } from '../executors/test_utils';
import { DefaultWorkflowTokenService, WorkflowTokenService } from './workflow_token_service';
import { WorkflowRailsService } from './workflow_rails_service';
import { GenerateTokenResponse } from './types';

describe('WorkflowTokenService', () => {
  let service: WorkflowTokenService;
  let mockWorkflowRailsService: WorkflowRailsService;
  let mockLogger: Logger;

  let mockToken: GenerateTokenResponse;

  beforeEach(() => {
    jest.useFakeTimers();

    mockWorkflowRailsService = createFakePartial<WorkflowRailsService>({
      getWorkflowToken: jest.fn(),
      revokeWorkflowToken: jest.fn(),
    });

    mockToken = getMockWorkflowToken();
    jest.mocked(mockWorkflowRailsService.getWorkflowToken).mockResolvedValue(mockToken);

    mockLogger = new TestLogger();

    service = new DefaultWorkflowTokenService(mockLogger, mockWorkflowRailsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('for agentic chat workflows', () => {
    const chatWorkflowId = 'chat-workflow-123';
    const anotherChatWorkflowId = 'another-chat-workflow';
    const rootNamespaceId = 'gid://gitlab/Group/123';

    describe('getToken', () => {
      it('fetches a new token when called', async () => {
        const token = await service.getToken(chatWorkflowId, WorkflowType.CHAT);

        expect(token).toEqual(mockToken);
        expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledTimes(1);
        expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledWith(
          WorkflowType.CHAT,
          undefined,
          undefined,
        );
      });

      it('fetches a new token with rootNamespaceId when provided', async () => {
        const token = await service.getToken(chatWorkflowId, WorkflowType.CHAT, rootNamespaceId);

        expect(token).toEqual(mockToken);
        expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledTimes(1);
        expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledWith(
          WorkflowType.CHAT,
          rootNamespaceId,
          undefined,
        );
      });

      it('reuses existing token when called multiple times', async () => {
        await service.getToken(chatWorkflowId, WorkflowType.CHAT);

        const token = await service.getToken(anotherChatWorkflowId, WorkflowType.CHAT);

        expect(token).toEqual(mockToken);
        expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledTimes(1);
      });
    });

    it('handles token expiry', async () => {
      await service.getToken(chatWorkflowId, WorkflowType.CHAT);

      jest.advanceTimersByTime(1800 * 1000); // 30 minutes in ms (token expires_at)

      await service.getToken(chatWorkflowId, WorkflowType.CHAT);

      expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledTimes(2);
    });

    it('fetches a new token if the existing one was revoked', async () => {
      const token = await service.getToken(chatWorkflowId, WorkflowType.CHAT);

      await service.revokeToken(chatWorkflowId, token);

      await service.getToken(chatWorkflowId, WorkflowType.CHAT);

      expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledTimes(2);
    });

    it('calls revokeWorkflowToken on the rails service', async () => {
      const token = await service.getToken(chatWorkflowId, WorkflowType.CHAT);

      await service.revokeToken(chatWorkflowId, token);

      expect(mockWorkflowRailsService.revokeWorkflowToken).toHaveBeenCalledTimes(1);
      expect(mockWorkflowRailsService.revokeWorkflowToken).toHaveBeenCalledWith(token);
    });
  });

  describe('for non-chat workflows', () => {
    const mockWorkflowId = 'workflow-123';
    const anotherWorkflowId = 'another-workflow';
    const rootNamespaceId = 'gid://gitlab/Group/456';

    describe('getToken', () => {
      it('fetches a new token when called', async () => {
        const token = await service.getToken(mockWorkflowId, WorkflowType.SOFTWARE_DEVELOPMENT);

        expect(token).toEqual(mockToken);
        expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledTimes(1);
        expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledWith(
          WorkflowType.SOFTWARE_DEVELOPMENT,
          undefined,
          undefined,
        );
      });

      it('fetches a new token with rootNamespaceId when provided', async () => {
        const token = await service.getToken(
          mockWorkflowId,
          WorkflowType.SOFTWARE_DEVELOPMENT,
          rootNamespaceId,
        );

        expect(token).toEqual(mockToken);
        expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledTimes(1);
        expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledWith(
          WorkflowType.SOFTWARE_DEVELOPMENT,
          rootNamespaceId,
          undefined,
        );
      });

      it('reuses existing token for the same workflow ID', async () => {
        await service.getToken(mockWorkflowId, WorkflowType.SOFTWARE_DEVELOPMENT);
        await service.getToken(mockWorkflowId, WorkflowType.SOFTWARE_DEVELOPMENT);

        expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledTimes(1);
      });
    });

    it('fetches a new token for different workflow IDs', async () => {
      await service.getToken(mockWorkflowId, WorkflowType.SOFTWARE_DEVELOPMENT);
      await service.getToken(anotherWorkflowId, WorkflowType.SOFTWARE_DEVELOPMENT);

      expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledTimes(2);
    });

    it('handles token expiry', async () => {
      await service.getToken(mockWorkflowId, WorkflowType.SOFTWARE_DEVELOPMENT);

      jest.advanceTimersByTime(1800 * 1000); // 30 minutes in ms (token expires_at)

      await service.getToken(mockWorkflowId, WorkflowType.SOFTWARE_DEVELOPMENT);

      expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledTimes(2);
    });

    it('fetches a new token if the existing one was revoked', async () => {
      const token = await service.getToken(mockWorkflowId, WorkflowType.SOFTWARE_DEVELOPMENT);

      await service.revokeToken(mockWorkflowId, token);

      await service.getToken(mockWorkflowId, WorkflowType.SOFTWARE_DEVELOPMENT);

      expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledTimes(2);
    });

    it('calls revokeWorkflowToken on the rails service', async () => {
      const token = await service.getToken(mockWorkflowId, WorkflowType.SOFTWARE_DEVELOPMENT);

      await service.revokeToken(mockWorkflowId, token);

      expect(mockWorkflowRailsService.revokeWorkflowToken).toHaveBeenCalledTimes(1);
      expect(mockWorkflowRailsService.revokeWorkflowToken).toHaveBeenCalledWith(token);
    });
  });

  describe('handling of different token expiry formats', () => {
    it('processes string date format for token expiry', async () => {
      const tokenWithISODateString = {
        ...mockToken,
        gitlab_rails: {
          ...mockToken.gitlab_rails,
          token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        },
        duo_workflow_service: {
          ...mockToken.duo_workflow_service,
          token_expires_at: new Date(Date.now() + 1800 * 1000).getTime() / 1000,
        },
      };

      jest
        .mocked(mockWorkflowRailsService.getWorkflowToken)
        .mockResolvedValueOnce(tokenWithISODateString);

      await expect(
        service.getToken('workflow-id', WorkflowType.SOFTWARE_DEVELOPMENT),
      ).resolves.not.toThrow();
    });

    it('throws an error when token expiry is not a number or string', async () => {
      const invalidToken = {
        ...mockToken,
        gitlab_rails: {
          ...mockToken.gitlab_rails,
          token_expires_at: { invalid: 'format' } as unknown as string,
        },
      };

      jest.mocked(mockWorkflowRailsService.getWorkflowToken).mockResolvedValueOnce(invalidToken);

      await expect(
        service.getToken('workflow-id', WorkflowType.SOFTWARE_DEVELOPMENT),
      ).rejects.toThrow('Received unexpected token expiry');
    });

    it('throws an error when token expiry date string is invalid', async () => {
      const invalidToken = {
        ...mockToken,
        gitlab_rails: {
          ...mockToken.gitlab_rails,
          token_expires_at: 'not-a-valid-date',
        },
      };

      jest.mocked(mockWorkflowRailsService.getWorkflowToken).mockResolvedValueOnce(invalidToken);

      await expect(
        service.getToken('workflow-id', WorkflowType.SOFTWARE_DEVELOPMENT),
      ).rejects.toThrow('Failed to parse token expiry date string');
    });
  });

  describe('getTokenFromCache', () => {
    describe.each([
      {
        workflowType: WorkflowType.SOFTWARE_DEVELOPMENT,
        description: 'non-chat workflows',
        workflowId: 'workflow-123',
        cacheWorkflowId: 'workflow-123',
        expectsWorkflowIdRequired: true,
      },
      {
        workflowType: WorkflowType.CHAT,
        description: 'chat workflows',
        workflowId: 'chat-workflow-1',
        cacheWorkflowId: 'chat-workflow-1',
        expectsWorkflowIdRequired: false,
      },
    ])(
      'for $description',
      ({ workflowType, workflowId, cacheWorkflowId, expectsWorkflowIdRequired }) => {
        it('returns cached token when token exists', () => {
          service.cacheToken(cacheWorkflowId, workflowType, mockToken);

          const result = service.getTokenFromCache({
            workflowType,
            workflowId,
          });

          expect(result).toEqual(mockToken);
        });

        it('returns null when no token is cached', () => {
          const result = service.getTokenFromCache({
            workflowType,
            workflowId,
          });

          expect(result).toBeNull();
        });

        if (expectsWorkflowIdRequired) {
          it('returns null when workflowId is not provided', () => {
            const result = service.getTokenFromCache({
              workflowType,
            });

            expect(result).toBeNull();
          });
        } else {
          it('returns cached token even when workflowId is not provided', () => {
            service.cacheToken(cacheWorkflowId, workflowType, mockToken);

            const result = service.getTokenFromCache({
              workflowType,
            });

            expect(result).toEqual(mockToken);
          });
        }
      },
    );

    describe('chat workflow specific behavior', () => {
      it('returns same token for different workflow IDs', () => {
        service.cacheToken('chat-workflow-1', WorkflowType.CHAT, mockToken);

        const result1 = service.getTokenFromCache({
          workflowType: WorkflowType.CHAT,
          workflowId: 'chat-workflow-1',
        });

        const result2 = service.getTokenFromCache({
          workflowType: WorkflowType.CHAT,
          workflowId: 'chat-workflow-2',
        });

        expect(result1).toEqual(mockToken);
        expect(result2).toEqual(mockToken);
      });
    });

    describe('edge cases', () => {
      it('returns null after token expires and is cleared', async () => {
        const workflowId = 'workflow-123';

        service.cacheToken(workflowId, WorkflowType.SOFTWARE_DEVELOPMENT, mockToken);

        // Fast-forward time to trigger expiry
        jest.advanceTimersByTime(1800 * 1000); // 30 minutes in ms (token expires_at)

        const result = service.getTokenFromCache({
          workflowType: WorkflowType.SOFTWARE_DEVELOPMENT,
          workflowId,
        });

        expect(result).toBeNull();
      });

      it('returns null after service is disposed', async () => {
        const workflowId = 'workflow-123';

        service.cacheToken(workflowId, WorkflowType.SOFTWARE_DEVELOPMENT, mockToken);

        service.dispose();

        const result = service.getTokenFromCache({
          workflowType: WorkflowType.SOFTWARE_DEVELOPMENT,
          workflowId,
        });

        expect(result).toBeNull();
      });
    });
  });

  describe('cacheToken', () => {
    const workflowId = 'test-workflow-123';

    it('caches a token for non-chat workflows', async () => {
      service.cacheToken(workflowId, WorkflowType.SOFTWARE_DEVELOPMENT, mockToken);

      // Verify token is cached by checking if getToken reuses it
      const token = await service.getToken(workflowId, WorkflowType.SOFTWARE_DEVELOPMENT);
      expect(token).toEqual(mockToken);
      expect(mockWorkflowRailsService.getWorkflowToken).not.toHaveBeenCalled();
    });

    it('caches a token for chat workflows using shared key', async () => {
      const chatWorkflowId1 = 'chat-workflow-1';
      const chatWorkflowId2 = 'chat-workflow-2';

      service.cacheToken(chatWorkflowId1, WorkflowType.CHAT, mockToken);

      // Verify both chat workflows share the same cached token
      const [token1, token2] = await Promise.all([
        service.getToken(chatWorkflowId1, WorkflowType.CHAT),
        service.getToken(chatWorkflowId2, WorkflowType.CHAT),
      ]);
      expect(token1).toEqual(mockToken);
      expect(token2).toEqual(mockToken);
      expect(mockWorkflowRailsService.getWorkflowToken).not.toHaveBeenCalled();
    });

    it('sets up automatic token expiry cleanup', async () => {
      service.cacheToken(workflowId, WorkflowType.SOFTWARE_DEVELOPMENT, mockToken);

      // Fast-forward time to trigger expiry
      jest.advanceTimersByTime(1800 * 1000); // 30 minutes in ms (token expires_at)

      // Verify token was cleared by checking if getToken fetches a new one
      await service.getToken(workflowId, WorkflowType.SOFTWARE_DEVELOPMENT);
      expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledTimes(1);
    });

    it('replaces existing cached token for the same workflow', async () => {
      const newMockToken = {
        ...mockToken,
        duo_workflow_service: {
          ...mockToken.duo_workflow_service,
          token: 'new-token-value',
        },
      };

      // Cache first token
      service.cacheToken(workflowId, WorkflowType.SOFTWARE_DEVELOPMENT, mockToken);

      // Cache second token (should replace the first)
      service.cacheToken(workflowId, WorkflowType.SOFTWARE_DEVELOPMENT, newMockToken);

      // Verify the new token is returned
      const token = await service.getToken(workflowId, WorkflowType.SOFTWARE_DEVELOPMENT);
      expect(token).toEqual(newMockToken);
      expect(mockWorkflowRailsService.getWorkflowToken).not.toHaveBeenCalled();
    });

    it('handles token expiry calculation with different expiry formats', () => {
      const tokenWithStringExpiry = {
        ...mockToken,
        gitlab_rails: {
          ...mockToken.gitlab_rails,
          token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        },
      };

      expect(() => {
        service.cacheToken(workflowId, WorkflowType.SOFTWARE_DEVELOPMENT, tokenWithStringExpiry);
      }).not.toThrow();
    });

    it('throws error for invalid token expiry format', () => {
      const invalidToken = {
        ...mockToken,
        gitlab_rails: {
          ...mockToken.gitlab_rails,
          token_expires_at: { invalid: 'format' } as unknown as string,
        },
      };

      expect(() => {
        service.cacheToken(workflowId, WorkflowType.SOFTWARE_DEVELOPMENT, invalidToken);
      }).toThrow('Received unexpected token expiry');
    });
  });

  describe('dispose', () => {
    it('clears all cached tokens and timeouts', async () => {
      jest.mocked(mockWorkflowRailsService.getWorkflowToken).mockResolvedValue(mockToken);

      await service.getToken('chat-workflow', WorkflowType.CHAT);
      await service.getToken('regular-workflow', WorkflowType.SOFTWARE_DEVELOPMENT);
      await service.getToken('another-workflow', WorkflowType.SOFTWARE_DEVELOPMENT);

      jest.mocked(mockWorkflowRailsService.getWorkflowToken).mockClear();

      service.dispose();

      await service.getToken('chat-workflow', WorkflowType.CHAT);
      await service.getToken('regular-workflow', WorkflowType.SOFTWARE_DEVELOPMENT);

      expect(mockWorkflowRailsService.getWorkflowToken).toHaveBeenCalledTimes(2);
    });
  });
});
