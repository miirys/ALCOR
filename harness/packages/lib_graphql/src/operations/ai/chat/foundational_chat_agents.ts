import { gql } from 'graphql-request';
import {
  FallbackEvent,
  FoundationalChatAgents,
  GraphQLOperation,
  NamespaceID,
  ProjectID,
} from '../../../types';

export type AiChatFoundationalAgentsVariables = {
  projectId: ProjectID;
  namespaceId: NamespaceID;
};

export type AiChatFoundationalAgentData = {
  aiFoundationalChatAgents: FoundationalChatAgents;
};

/**
 * Available chat agents for Duo Agent Platform including GitLab default and pinned model selection.
 */
export const AiChatFoundationalAgentsQuery: GraphQLOperation<AiChatFoundationalAgentData> = {
  supportedSinceInstanceVersion: '18.6.0',
  query: gql`
    query lsp_aiFoundationalAgents($projectId: ProjectID!, $namespaceId: NamespaceID!) {
      aiFoundationalChatAgents(projectId: $projectId, namespaceId: $namespaceId) {
        nodes {
          id
          name
          description
          referenceWithVersion
          selectableInChat @gl_introduced(version: "18.11.0")
        }
      }
    }
  `,
  fallback: (event: FallbackEvent): AiChatFoundationalAgentData => {
    if (event.err) {
      throw new Error(`Error querying foundational agents: ${event.err}`, {
        cause: event.err,
      });
    }

    return {
      aiFoundationalChatAgents: { nodes: [] },
    };
  },
};
