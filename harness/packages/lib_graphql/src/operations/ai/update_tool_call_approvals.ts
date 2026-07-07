import { gql } from 'graphql-request';
import { AiDuoWorkflowsWorkflowID, FallbackEvent, GraphQLOperation } from '../../types';

export type UpdateToolCallApprovalsVariables = {
  workflowId: AiDuoWorkflowsWorkflowID;
  toolName: string;
  // Arguments for the tool call. Maps to GraphQL JSON scalar type.
  // The server manages the structure and storage of tool call approvals.
  // Exactly one of toolCallArgs or pattern must be provided.
  toolCallArgs?: string;
  // Glob pattern for pattern-based session approvals (e.g. "git checkout *")
  pattern?: string;
};

export type UpdateToolCallApprovalsData = {
  updateDuoWorkflowToolCallApprovals: {
    workflow: {
      id: string;
      toolCallApprovals: string | null;
    } | null;
    errors: string[];
  };
};

export const UpdateToolCallApprovalsMutation: GraphQLOperation<UpdateToolCallApprovalsData> = {
  supportedSinceInstanceVersion: '18.9.0',
  query: gql`
    mutation UpdateToolCallApprovals(
      $workflowId: AiDuoWorkflowsWorkflowID!
      $toolName: String!
      $toolCallArgs: JSON
      $pattern: String
    ) {
      updateDuoWorkflowToolCallApprovals(
        input: {
          workflowId: $workflowId
          toolName: $toolName
          toolCallArgs: $toolCallArgs
          pattern: $pattern
        }
      ) {
        workflow {
          id
          toolCallApprovals
        }
        errors
      }
    }
  `,
  fallback: (event: FallbackEvent): UpdateToolCallApprovalsData => {
    if (event.err) {
      throw new Error(`Error updating tool call approvals: ${event.err}`, {
        cause: event.err,
      });
    }

    // Instance too old for the mutation: treat as a no-op rather than an error so
    // callers don't log a misleading "Failed to persist" warning.
    if (event.unsupported) {
      return { updateDuoWorkflowToolCallApprovals: { workflow: null, errors: [] } };
    }

    return {
      updateDuoWorkflowToolCallApprovals: {
        workflow: null,
        errors: ['Failed to update tool call approvals'],
      },
    };
  },
};
