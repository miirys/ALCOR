import { gql } from 'graphql-request';
import { AiDuoWorkflowsWorkflowID, FallbackEvent, GraphQLOperation } from '../../types';

export type DeleteDuoWorkflowsWorkflowVariables = {
  // Global ID of the workflow to delete.
  workflowId: AiDuoWorkflowsWorkflowID;
  // A unique identifier for the client performing the mutation.
  clientMutationId?: string;
};

export type DeleteDuoWorkflowsWorkflowData = {
  deleteDuoWorkflowsWorkflow: {
    clientMutationId: string | null;
    errors: string[];
    success: boolean;
  };
};

export const DeleteDuoWorkflowsWorkflowMutation: GraphQLOperation<DeleteDuoWorkflowsWorkflowData> =
  {
    supportedSinceInstanceVersion: '18.1.0',
    query: gql`
      mutation deleteDuoWorkflowsWorkflow($input: DeleteDuoWorkflowsWorkflowInput!) {
        deleteDuoWorkflowsWorkflow(input: $input) {
          clientMutationId
          errors
          success
        }
      }
    `,
    fallback: (event: FallbackEvent): DeleteDuoWorkflowsWorkflowData => {
      if (event.err) {
        throw new Error(`Error deleting a workflow: ${event.err}`, {
          cause: event.err,
        });
      }

      return {
        deleteDuoWorkflowsWorkflow: {
          clientMutationId: null,
          errors: [],
          success: false,
        },
      };
    },
  };
