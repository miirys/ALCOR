import type { GitLabApiService } from '@gitlab-org/core';
import { toGitLabGid } from '@gitlab-org/core';
import type { Logger } from '@gitlab-org/logging';
import type {
  UpdateToolCallApprovalsData,
  UpdateToolCallApprovalsVariables,
} from '@gitlab-org/graphql';
import { UpdateToolCallApprovalsMutation } from '@gitlab-org/graphql';
import type { McpToolApprovalController, WorkflowId } from '@gitlab-org/ai-configuration';
import { McpToolName } from '@gitlab-org/ai-configuration';
import { supportsToolCallApprovals } from './capability_checker';

const WORKFLOW_GID_TYPE = 'Ai::DuoWorkflows::Workflow';

export interface ToolApprovalPersistenceOptions {
  /**
   * Workflow ID (numeric string, will be converted to GID for GraphQL)
   */
  workflowId: string;
  /**
   * Tool name being approved (e.g., 'run_command', 'mcp__read_file')
   */
  toolName: string;
  /**
   * Tool arguments to persist (allows backend to match future calls)
   */
  toolArgs: Record<string, unknown>;
  /**
   * GitLab API service for making GraphQL requests
   */
  gitlabApiService: GitLabApiService;
  /**
   * Logger for debug/error messages
   */
  logger: Logger;
  /**
   * Gateway capabilities for this workflow, from WorkflowRunner.getServerCapabilities().
   * Used to check if Gateway supports the 'tool_call_approval' capability.
   */
  capabilities: string[] | null;
  /**
   * Optional MCP tool approval controller for legacy fallback.
   * Only used for MCP tools when GraphQL approvals aren't supported.
   */
  mcpToolApprovalController?: McpToolApprovalController;
}

export interface PatternApprovalPersistenceOptions {
  /**
   * Workflow ID (numeric string, will be converted to GID for GraphQL)
   */
  workflowId: string;
  /**
   * Tool name being approved (e.g., 'run_command', 'mcp__read_file')
   */
  toolName: string;
  /**
   * Glob pattern for matching future tool calls (e.g. "git checkout *")
   */
  pattern: string;
  /**
   * GitLab API service for making GraphQL requests
   */
  gitlabApiService: GitLabApiService;
  /**
   * Logger for debug/error messages
   */
  logger: Logger;
}

/**
 * Persists a tool approval for the current workflow session.
 *
 * Strategy:
 * 1. Check if tool call approvals are supported (Gateway has 'tool_call_approval' capability)
 * 2. If supported → Use GraphQL mutation (all tools, including MCP)
 * 3. If not supported AND tool is MCP → Use local MCP controller (backward compat)
 * 4. If not supported AND tool is non-MCP → Skip (user sees approval but it's not persisted)
 *
 * All errors are logged internally and do not propagate to the caller.
 */
export async function persistToolApprovalForSession(
  options: ToolApprovalPersistenceOptions,
): Promise<void> {
  const {
    workflowId,
    toolName,
    toolArgs,
    gitlabApiService,
    logger,
    capabilities,
    mcpToolApprovalController,
  } = options;

  // Check if GraphQL approvals are supported
  const supportsGraphQL = supportsToolCallApprovals({
    logger,
    capabilities,
  });

  if (supportsGraphQL) {
    // Full support: Use GraphQL for ALL tools (including MCP)
    await persistViaGraphQL(workflowId, toolName, toolArgs, gitlabApiService, logger);
    return;
  }

  // No GraphQL support - fallback to MCP controller if applicable
  if (McpToolName.is(toolName)) {
    if (!mcpToolApprovalController) {
      logger.warn(
        `Cannot persist session approval for MCP tool "${toolName}": MCP controller not available`,
      );
      return;
    }

    await persistViaMcpController(
      workflowId as WorkflowId,
      toolName,
      mcpToolApprovalController,
      logger,
    );
    return;
  }

  // Non-MCP tool without Gateway support: Cannot persist
  logger.info(
    `Session approval for "${toolName}" cannot be persisted: Gateway does not support GraphQL approvals for non-MCP tools. Approval is effective for this single tool call only.`,
  );
}

/**
 * Persists tool approval via GraphQL mutation
 */
async function persistViaGraphQL(
  workflowId: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
  gitlabApiService: GitLabApiService,
  logger: Logger,
): Promise<void> {
  try {
    const graphqlWorkflowId = toGitLabGid(WORKFLOW_GID_TYPE, workflowId);

    logger.info(
      `Persisting tool approval for "${toolName}" via GraphQL (workflow: ${workflowId}, gid: ${graphqlWorkflowId})`,
    );
    logger.debug(
      `GraphQL mutation variables: ${JSON.stringify({
        workflowId: graphqlWorkflowId,
        toolName,
        toolCallArgs: JSON.stringify(toolArgs),
      })}`,
    );

    const variables: UpdateToolCallApprovalsVariables = {
      workflowId: graphqlWorkflowId,
      toolName,
      toolCallArgs: JSON.stringify(toolArgs),
    };

    const result = await gitlabApiService.fetchFromApi<UpdateToolCallApprovalsData>({
      type: 'graphql',
      query: UpdateToolCallApprovalsMutation.query,
      variables,
    });

    logger.debug(
      `GraphQL mutation response: ${JSON.stringify(result.updateDuoWorkflowToolCallApprovals)}`,
    );

    if (result.updateDuoWorkflowToolCallApprovals.errors.length > 0) {
      logger.warn(
        `Failed to persist tool approval: ${result.updateDuoWorkflowToolCallApprovals.errors.join(', ')}`,
      );
      return;
    }

    logger.info(
      `Tool approval persisted successfully for "${toolName}". Args: ${JSON.stringify(toolArgs)}`,
    );
  } catch (error) {
    logger.error(`Error persisting tool approval via GraphQL: ${String(error)}`);
    // Don't throw - approval failure shouldn't block tool execution
  }
}

/**
 * Persists a pattern-based tool approval for the current workflow session.
 *
 * All errors are logged internally and do not propagate to the caller.
 * Callers are expected to gate on `supportsPatternApprovals` before invoking this function.
 */
export async function persistPatternApprovalForSession(
  options: PatternApprovalPersistenceOptions,
): Promise<void> {
  const { workflowId, toolName, pattern, gitlabApiService, logger } = options;

  try {
    const graphqlWorkflowId = toGitLabGid(WORKFLOW_GID_TYPE, workflowId);

    logger.info(
      `Persisting pattern approval for "${toolName}" via GraphQL (workflow: ${workflowId}, pattern: "${pattern}")`,
    );
    logger.debug(
      `GraphQL mutation variables: ${JSON.stringify({
        workflowId: graphqlWorkflowId,
        toolName,
        pattern,
      })}`,
    );

    const variables: UpdateToolCallApprovalsVariables = {
      workflowId: graphqlWorkflowId,
      toolName,
      pattern,
    };

    const result = await gitlabApiService.fetchFromApi<UpdateToolCallApprovalsData>({
      type: 'graphql',
      query: UpdateToolCallApprovalsMutation.query,
      variables,
    });

    logger.debug(
      `GraphQL mutation response: ${JSON.stringify(result.updateDuoWorkflowToolCallApprovals)}`,
    );

    if (result.updateDuoWorkflowToolCallApprovals.errors.length > 0) {
      logger.warn(
        `Failed to persist pattern approval: ${result.updateDuoWorkflowToolCallApprovals.errors.join(', ')}`,
      );
      return;
    }

    logger.info(`Pattern approval persisted successfully for "${toolName}". Pattern: "${pattern}"`);
  } catch (error) {
    // Don't throw - approval failure shouldn't block tool execution
    logger.error(`Error persisting pattern approval via GraphQL: ${String(error)}`);
  }
}

/**
 * Persists MCP tool approval via local controller (legacy fallback when Gateway doesn't support tool_call_approval)
 */
async function persistViaMcpController(
  workflowId: WorkflowId,
  toolName: McpToolName,
  mcpToolApprovalController: McpToolApprovalController,
  logger: Logger,
): Promise<void> {
  try {
    logger.info(
      `Persisting MCP tool approval for "${toolName}" via local controller (legacy fallback)`,
    );

    await mcpToolApprovalController.approveToolForSession(workflowId, toolName);

    logger.info(`MCP tool approval persisted successfully for "${toolName}"`);
  } catch (error) {
    logger.error(`Error persisting MCP tool approval via local controller: ${String(error)}`);
  }
}
