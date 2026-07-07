import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { GitLabApiService } from '@gitlab-org/core';
import type { McpToolApprovalController, WorkflowId } from '@gitlab-org/ai-configuration';
import type { UpdateToolCallApprovalsData } from '@gitlab-org/graphql';
import { persistToolApprovalForSession, persistPatternApprovalForSession } from './persistence';
import * as capabilityChecker from './capability_checker';

// Mock the capability checker module
jest.mock('./capability_checker');

describe('persistToolApprovalForSession', () => {
  let logger: TestLogger;
  let gitlabApiService: GitLabApiService;
  let mcpToolApprovalController: McpToolApprovalController;
  let capabilities: string[];
  let mockSupportsToolCallApprovals: jest.MockedFunction<
    typeof capabilityChecker.supportsToolCallApprovals
  >;

  const workflowId = '123';
  const mcpToolName = 'mcp__filesystem__read_file';
  const nonMcpToolName = 'run_command';
  const toolArgs = { path: '/home/user/file.txt', limit: 100 };

  beforeEach(() => {
    logger = new TestLogger();
    capabilities = ['tool_call_approval'];

    gitlabApiService = createFakePartial<GitLabApiService>({
      instanceInfo: {
        instanceUrl: new URL('https://gitlab.com'),
      },
      fetchFromApi: jest.fn() as GitLabApiService['fetchFromApi'],
    });

    mcpToolApprovalController = createFakePartial<McpToolApprovalController>({
      approveToolForSession: jest.fn() as McpToolApprovalController['approveToolForSession'],
    });

    // Get the mocked function
    mockSupportsToolCallApprovals = jest.mocked(capabilityChecker.supportsToolCallApprovals);
  });

  describe('when GraphQL approvals are supported', () => {
    beforeEach(() => {
      mockSupportsToolCallApprovals.mockReturnValue(true);
    });

    describe('for MCP tools', () => {
      const successResponse: UpdateToolCallApprovalsData = {
        updateDuoWorkflowToolCallApprovals: {
          workflow: {
            id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
            toolCallApprovals: JSON.stringify([mcpToolName]),
          },
          errors: [],
        },
      };

      beforeEach(() => {
        jest.mocked(gitlabApiService.fetchFromApi).mockResolvedValue(successResponse);
      });

      it('persists via GraphQL', async () => {
        await persistToolApprovalForSession({
          workflowId,
          toolName: mcpToolName,
          toolArgs,
          gitlabApiService,
          logger,
          capabilities,
          mcpToolApprovalController,
        });

        expect(gitlabApiService.fetchFromApi).toHaveBeenCalledTimes(1);
        expect(gitlabApiService.fetchFromApi).toHaveBeenCalledWith({
          type: 'graphql',
          query: expect.any(String),
          variables: {
            workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
            toolName: mcpToolName,
            toolCallArgs: JSON.stringify(toolArgs),
          },
        });
      });

      it('logs appropriate messages on success', async () => {
        await persistToolApprovalForSession({
          workflowId,
          toolName: mcpToolName,
          toolArgs,
          gitlabApiService,
          logger,
          capabilities,
          mcpToolApprovalController,
        });

        expect(logger.infoLogs).toHaveLength(2);
        expect(logger.infoLogs[0]?.message).toContain(
          `Persisting tool approval for "${mcpToolName}" via GraphQL`,
        );
        expect(logger.infoLogs[0]?.message).toContain('workflow: 123');
        expect(logger.infoLogs[0]?.message).toContain(
          'gid: gid://gitlab/Ai::DuoWorkflows::Workflow/123',
        );
        expect(logger.infoLogs[1]?.message).toContain(
          `Tool approval persisted successfully for "${mcpToolName}"`,
        );

        expect(logger.debugLogs).toHaveLength(2);
        expect(logger.debugLogs[0]?.message).toContain('GraphQL mutation variables:');
        expect(logger.debugLogs[1]?.message).toContain('GraphQL mutation response:');
      });

      it('logs a warning when GraphQL mutation has errors', async () => {
        const errorResponse: UpdateToolCallApprovalsData = {
          updateDuoWorkflowToolCallApprovals: {
            workflow: null,
            errors: ['Validation failed', 'Invalid workflow ID'],
          },
        };
        jest.mocked(gitlabApiService.fetchFromApi).mockResolvedValue(errorResponse);

        await persistToolApprovalForSession({
          workflowId,
          toolName: mcpToolName,
          toolArgs,
          gitlabApiService,
          logger,
          capabilities,
          mcpToolApprovalController,
        });

        expect(logger.warnLogs).toHaveLength(1);
        expect(logger.warnLogs[0]?.message).toContain('Failed to persist tool approval');
        expect(logger.warnLogs[0]?.message).toContain('Validation failed');
        expect(logger.warnLogs[0]?.message).toContain('Invalid workflow ID');
      });

      it('logs an error when GraphQL throws exception', async () => {
        const error = new Error('Network error');
        jest.mocked(gitlabApiService.fetchFromApi).mockRejectedValue(error);

        await persistToolApprovalForSession({
          workflowId,
          toolName: mcpToolName,
          toolArgs,
          gitlabApiService,
          logger,
          capabilities,
          mcpToolApprovalController,
        });

        expect(logger.errorLogs).toHaveLength(1);
        expect(logger.errorLogs[0]?.message).toContain(
          'Error persisting tool approval via GraphQL',
        );
        expect(logger.errorLogs[0]?.message).toContain('Network error');
      });

      it('properly converts workflow ID to GID format', async () => {
        await persistToolApprovalForSession({
          workflowId,
          toolName: mcpToolName,
          toolArgs,
          gitlabApiService,
          logger,
          capabilities,
          mcpToolApprovalController,
        });

        const call = jest.mocked(gitlabApiService.fetchFromApi).mock.calls[0];
        expect(call[0]).toMatchObject({
          variables: {
            workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          },
        });
      });

      it('stringifies tool args for GraphQL', async () => {
        const complexArgs = {
          nested: { key: 'value', array: [1, 2, 3] },
          simple: 'string',
        };

        await persistToolApprovalForSession({
          workflowId,
          toolName: mcpToolName,
          toolArgs: complexArgs,
          gitlabApiService,
          logger,
          capabilities,
          mcpToolApprovalController,
        });

        const call = jest.mocked(gitlabApiService.fetchFromApi).mock.calls[0];
        expect(call[0]).toMatchObject({
          variables: {
            toolCallArgs: JSON.stringify(complexArgs),
          },
        });
      });
    });

    describe('for non-MCP tools', () => {
      const successResponse: UpdateToolCallApprovalsData = {
        updateDuoWorkflowToolCallApprovals: {
          workflow: {
            id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
            toolCallApprovals: JSON.stringify([nonMcpToolName]),
          },
          errors: [],
        },
      };

      beforeEach(() => {
        jest.mocked(gitlabApiService.fetchFromApi).mockResolvedValue(successResponse);
      });

      it('persists via GraphQL', async () => {
        await persistToolApprovalForSession({
          workflowId,
          toolName: nonMcpToolName,
          toolArgs,
          gitlabApiService,
          logger,
          capabilities,
        });

        expect(gitlabApiService.fetchFromApi).toHaveBeenCalledTimes(1);
        expect(gitlabApiService.fetchFromApi).toHaveBeenCalledWith({
          type: 'graphql',
          query: expect.any(String),
          variables: {
            workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
            toolName: nonMcpToolName,
            toolCallArgs: JSON.stringify(toolArgs),
          },
        });
      });

      it('logs a warning when GraphQL mutation has errors', async () => {
        const errorResponse: UpdateToolCallApprovalsData = {
          updateDuoWorkflowToolCallApprovals: {
            workflow: null,
            errors: ['Unauthorized'],
          },
        };
        jest.mocked(gitlabApiService.fetchFromApi).mockResolvedValue(errorResponse);

        await persistToolApprovalForSession({
          workflowId,
          toolName: nonMcpToolName,
          toolArgs,
          gitlabApiService,
          logger,
          capabilities,
        });

        expect(logger.warnLogs).toHaveLength(1);
        expect(logger.warnLogs[0]?.message).toContain('Unauthorized');
      });
    });
  });

  describe('when GraphQL approvals are not supported', () => {
    beforeEach(() => {
      mockSupportsToolCallApprovals.mockReturnValue(false);
    });

    describe('for MCP tools', () => {
      describe('when MCP controller is provided', () => {
        beforeEach(() => {
          jest.mocked(mcpToolApprovalController.approveToolForSession).mockResolvedValue(undefined);
        });

        it('persists via MCP controller', async () => {
          await persistToolApprovalForSession({
            workflowId,
            toolName: mcpToolName,
            toolArgs,
            gitlabApiService,
            logger,
            capabilities,
            mcpToolApprovalController,
          });

          expect(mcpToolApprovalController.approveToolForSession).toHaveBeenCalledTimes(1);
          expect(mcpToolApprovalController.approveToolForSession).toHaveBeenCalledWith(
            workflowId as WorkflowId,
            mcpToolName,
          );
        });

        it('logs appropriate messages on success', async () => {
          await persistToolApprovalForSession({
            workflowId,
            toolName: mcpToolName,
            toolArgs,
            gitlabApiService,
            logger,
            capabilities,
            mcpToolApprovalController,
          });

          expect(logger.infoLogs).toHaveLength(2);
          expect(logger.infoLogs[0]?.message).toContain(
            `Persisting MCP tool approval for "${mcpToolName}" via local controller`,
          );
          expect(logger.infoLogs[0]?.message).toContain('legacy fallback');
          expect(logger.infoLogs[1]?.message).toContain(
            `MCP tool approval persisted successfully for "${mcpToolName}"`,
          );
        });

        it('logs an error when MCP controller throws exception', async () => {
          const error = new Error('MCP controller error');
          jest.mocked(mcpToolApprovalController.approveToolForSession).mockRejectedValue(error);

          await persistToolApprovalForSession({
            workflowId,
            toolName: mcpToolName,
            toolArgs,
            gitlabApiService,
            logger,
            capabilities,
            mcpToolApprovalController,
          });

          expect(logger.errorLogs).toHaveLength(1);
          expect(logger.errorLogs[0]?.message).toContain(
            'Error persisting MCP tool approval via local controller',
          );
          expect(logger.errorLogs[0]?.message).toContain('MCP controller error');
        });
      });

      describe('when MCP controller is not provided', () => {
        it('logs a warning', async () => {
          await persistToolApprovalForSession({
            workflowId,
            toolName: mcpToolName,
            toolArgs,
            gitlabApiService,
            logger,
            capabilities,
            mcpToolApprovalController: undefined,
          });

          expect(logger.warnLogs).toHaveLength(1);
          expect(logger.warnLogs[0]?.message).toContain(
            `Cannot persist session approval for MCP tool "${mcpToolName}"`,
          );
          expect(logger.warnLogs[0]?.message).toContain('MCP controller not available');
        });
      });
    });

    describe('for non-MCP tools', () => {
      it('logs info about unsupported version', async () => {
        await persistToolApprovalForSession({
          workflowId,
          toolName: nonMcpToolName,
          toolArgs,
          gitlabApiService,
          logger,
          capabilities,
        });

        expect(logger.infoLogs).toHaveLength(1);
        expect(logger.infoLogs[0]?.message).toContain(
          `Session approval for "${nonMcpToolName}" cannot be persisted`,
        );
        expect(logger.infoLogs[0]?.message).toContain('Gateway');
        expect(logger.infoLogs[0]?.message).toContain(
          'does not support GraphQL approvals for non-MCP tools',
        );
        expect(logger.infoLogs[0]?.message).toContain(
          'Approval is effective for this single tool call only',
        );
      });

      it('does not call any persistence methods', async () => {
        await persistToolApprovalForSession({
          workflowId,
          toolName: nonMcpToolName,
          toolArgs,
          gitlabApiService,
          logger,
          capabilities,
        });

        expect(gitlabApiService.fetchFromApi).not.toHaveBeenCalled();
      });
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      mockSupportsToolCallApprovals.mockReturnValue(true);
    });

    it('handles empty tool args', async () => {
      const successResponse: UpdateToolCallApprovalsData = {
        updateDuoWorkflowToolCallApprovals: {
          workflow: {
            id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
            toolCallApprovals: JSON.stringify([nonMcpToolName]),
          },
          errors: [],
        },
      };
      jest.mocked(gitlabApiService.fetchFromApi).mockResolvedValue(successResponse);

      await persistToolApprovalForSession({
        workflowId,
        toolName: nonMcpToolName,
        toolArgs: {},
        gitlabApiService,
        logger,
        capabilities,
      });

      const call = jest.mocked(gitlabApiService.fetchFromApi).mock.calls[0];
      expect(call[0]).toMatchObject({
        variables: {
          toolCallArgs: '{}',
        },
      });
    });

    it('handles complex nested tool args', async () => {
      const successResponse: UpdateToolCallApprovalsData = {
        updateDuoWorkflowToolCallApprovals: {
          workflow: {
            id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
            toolCallApprovals: JSON.stringify([nonMcpToolName]),
          },
          errors: [],
        },
      };
      jest.mocked(gitlabApiService.fetchFromApi).mockResolvedValue(successResponse);

      const complexArgs = {
        level1: {
          level2: {
            level3: ['a', 'b', 'c'],
            bool: true,
            num: 42,
          },
        },
        array: [{ x: 1 }, { y: 2 }],
      };

      await persistToolApprovalForSession({
        workflowId,
        toolName: nonMcpToolName,
        toolArgs: complexArgs,
        gitlabApiService,
        logger,
        capabilities,
      });

      const call = jest.mocked(gitlabApiService.fetchFromApi).mock.calls[0];
      expect(call[0]).toMatchObject({
        variables: {
          toolCallArgs: JSON.stringify(complexArgs),
        },
      });
    });

    it('handles multiple errors in GraphQL response', async () => {
      const errorResponse: UpdateToolCallApprovalsData = {
        updateDuoWorkflowToolCallApprovals: {
          workflow: null,
          errors: ['Error 1', 'Error 2', 'Error 3'],
        },
      };
      jest.mocked(gitlabApiService.fetchFromApi).mockResolvedValue(errorResponse);

      await persistToolApprovalForSession({
        workflowId,
        toolName: nonMcpToolName,
        toolArgs,
        gitlabApiService,
        logger,
        capabilities,
      });

      expect(logger.warnLogs).toHaveLength(1);
      expect(logger.warnLogs[0]?.message).toContain('Error 1, Error 2, Error 3');
    });
  });
});

describe('persistPatternApprovalForSession', () => {
  let logger: TestLogger;
  let gitlabApiService: GitLabApiService;

  const workflowId = '123';
  const toolName = 'run_command';
  const pattern = 'git checkout *';

  beforeEach(() => {
    logger = new TestLogger();

    gitlabApiService = createFakePartial<GitLabApiService>({
      instanceInfo: {
        instanceUrl: new URL('https://gitlab.com'),
      },
      fetchFromApi: jest.fn() as GitLabApiService['fetchFromApi'],
    });
  });

  it('sends pattern in GraphQL mutation instead of toolCallArgs', async () => {
    const successResponse: UpdateToolCallApprovalsData = {
      updateDuoWorkflowToolCallApprovals: {
        workflow: {
          id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          toolCallApprovals: JSON.stringify({ run_command: { patterns: ['git checkout *'] } }),
        },
        errors: [],
      },
    };
    jest.mocked(gitlabApiService.fetchFromApi).mockResolvedValue(successResponse);

    await persistPatternApprovalForSession({
      workflowId,
      toolName,
      pattern,
      gitlabApiService,
      logger,
    });

    expect(gitlabApiService.fetchFromApi).toHaveBeenCalledTimes(1);
    expect(gitlabApiService.fetchFromApi).toHaveBeenCalledWith({
      type: 'graphql',
      query: expect.any(String),
      variables: {
        workflowId: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
        toolName,
        pattern,
      },
    });
  });

  it('logs appropriate messages on success', async () => {
    const successResponse: UpdateToolCallApprovalsData = {
      updateDuoWorkflowToolCallApprovals: {
        workflow: {
          id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          toolCallApprovals: null,
        },
        errors: [],
      },
    };
    jest.mocked(gitlabApiService.fetchFromApi).mockResolvedValue(successResponse);

    await persistPatternApprovalForSession({
      workflowId,
      toolName,
      pattern,
      gitlabApiService,
      logger,
    });

    expect(logger.infoLogs).toHaveLength(2);
    expect(logger.infoLogs[0]?.message).toContain(
      `Persisting pattern approval for "${toolName}" via GraphQL`,
    );
    expect(logger.infoLogs[0]?.message).toContain(`pattern: "${pattern}"`);
    expect(logger.infoLogs[1]?.message).toContain(
      `Pattern approval persisted successfully for "${toolName}"`,
    );
  });

  it('logs a warning when GraphQL mutation has errors', async () => {
    const errorResponse: UpdateToolCallApprovalsData = {
      updateDuoWorkflowToolCallApprovals: {
        workflow: null,
        errors: ['Invalid pattern'],
      },
    };
    jest.mocked(gitlabApiService.fetchFromApi).mockResolvedValue(errorResponse);

    await persistPatternApprovalForSession({
      workflowId,
      toolName,
      pattern,
      gitlabApiService,
      logger,
    });

    expect(logger.warnLogs).toHaveLength(1);
    expect(logger.warnLogs[0]?.message).toContain('Failed to persist pattern approval');
    expect(logger.warnLogs[0]?.message).toContain('Invalid pattern');
  });

  it('logs an error when GraphQL throws exception', async () => {
    const error = new Error('Network error');
    jest.mocked(gitlabApiService.fetchFromApi).mockRejectedValue(error);

    await persistPatternApprovalForSession({
      workflowId,
      toolName,
      pattern,
      gitlabApiService,
      logger,
    });

    expect(logger.errorLogs).toHaveLength(1);
    expect(logger.errorLogs[0]?.message).toContain('Error persisting pattern approval via GraphQL');
  });

  it('does not include toolCallArgs in the variables', async () => {
    const successResponse: UpdateToolCallApprovalsData = {
      updateDuoWorkflowToolCallApprovals: {
        workflow: {
          id: 'gid://gitlab/Ai::DuoWorkflows::Workflow/123',
          toolCallApprovals: null,
        },
        errors: [],
      },
    };
    jest.mocked(gitlabApiService.fetchFromApi).mockResolvedValue(successResponse);

    await persistPatternApprovalForSession({
      workflowId,
      toolName,
      pattern,
      gitlabApiService,
      logger,
    });

    const call = jest.mocked(gitlabApiService.fetchFromApi).mock.calls[0];
    const { variables } = call[0] as { variables: Record<string, unknown> };
    expect(variables).not.toHaveProperty('toolCallArgs');
    expect(variables).toHaveProperty('pattern', pattern);
  });
});
