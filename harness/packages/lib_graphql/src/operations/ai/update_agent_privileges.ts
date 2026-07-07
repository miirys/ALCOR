import { gql } from 'graphql-request';
import { AiDuoWorkflowsWorkflowID, FallbackEvent, GraphQLOperation } from '../../types';

export type UpdateAgentPrivilegesVariables = {
  workflowId: AiDuoWorkflowsWorkflowID;
  agentPrivileges?: number[];
  preApprovedAgentPrivileges?: number[];
};

export type UpdateAgentPrivilegesData = {
  updateDuoWorkflowAgentPrivileges: {
    workflow: {
      id: string;
    } | null;
    errors: string[];
  };
};

export const UpdateAgentPrivilegesMutation: GraphQLOperation<UpdateAgentPrivilegesData> = {
  supportedSinceInstanceVersion: '19.2.0',
  query: gql`
    mutation UpdateAgentPrivileges(
      $workflowId: AiDuoWorkflowsWorkflowID!
      $agentPrivileges: [Int!]
      $preApprovedAgentPrivileges: [Int!]
    ) {
      updateDuoWorkflowAgentPrivileges(
        input: {
          workflowId: $workflowId
          agentPrivileges: $agentPrivileges
          preApprovedAgentPrivileges: $preApprovedAgentPrivileges
        }
      ) {
        workflow {
          id
        }
        errors
      }
    }
  `,
  fallback: (event: FallbackEvent): UpdateAgentPrivilegesData => {
    if (event.err) {
      throw new Error(`Error updating agent privileges: ${event.err}`, {
        cause: event.err,
      });
    }

    // Report as a no-op rather than a failure: mode switching is the only caller
    // and it is gated client-side (the `--developer` flag), so on older instances
    // it silently degrades to prompt-only enforcement instead of surfacing a
    // version mismatch the user can do nothing about.
    if (event.unsupported) {
      return {
        updateDuoWorkflowAgentPrivileges: {
          workflow: null,
          errors: [],
        },
      };
    }

    return {
      updateDuoWorkflowAgentPrivileges: {
        workflow: null,
        errors: ['Failed to update agent privileges'],
      },
    };
  },
};
