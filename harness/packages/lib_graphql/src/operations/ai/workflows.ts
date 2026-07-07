import { gql } from 'graphql-request';
import { FallbackEvent, GraphQLOperation } from '../../types';
import { DuoWorkflowConnection } from '../../types/ai/workflows';

export type getWorkflowsVariables = {
  // Returns the first n elements from the list.
  first: number | null;
  // Returns the last n elements from the list.
  last: number | null;
  // Returns the elements in the list that come after the specified cursor.
  after: string | null;
  // 	Returns the elements in the list that come before the specified cursor.
  before: string | null;
  // type of workflow
  type: string;
  // workflow title or goal to search for.
  search: string | null;
};

export type DuoWorkflowData = {
  duoWorkflowWorkflows: DuoWorkflowConnection;
};

/**
 * Duo workflows for Duo Agent Platform
 */
export const DuoWorkflowWorkflowsQuery: GraphQLOperation<DuoWorkflowData> = {
  supportedSinceInstanceVersion: '0.0.0',
  query: gql`
    query getUserWorkflows(
      $type: String
      $search: String
      $after: String
      $before: String
      $first: Int
      $last: Int
    ) {
      duoWorkflowWorkflows(
        type: $type
        search: $search
        first: $first
        after: $after
        last: $last
        before: $before
      ) {
        pageInfo {
          startCursor
          endCursor
          hasNextPage
          hasPreviousPage
        }
        edges {
          node {
            id
            projectId
            humanStatus
            project {
              fullPath
            }
            updatedAt
            goal
            archived
            workflowDefinition
            aiCatalogItemVersionId @gl_introduced(version: "18.4.0")
            latestCheckpoint {
              duoMessages {
                content
                messageType
                toolInfo
              }
            }
          }
        }
      }
    }
  `,
  fallback: (event: FallbackEvent): DuoWorkflowData => {
    if (event.err) {
      throw new Error(`Error querying workflows: ${event.err}`, {
        cause: event.err,
      });
    }

    return {
      duoWorkflowWorkflows: {
        edges: null,
        pageInfo: {
          startCursor: '',
          endCursor: '',
          hasNextPage: false,
          hasPreviousPage: false,
        },
      },
    };
  },
};
