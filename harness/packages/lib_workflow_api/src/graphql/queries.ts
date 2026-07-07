import { gql } from 'graphql-request';

export const GET_PROJECT_DATA = gql`
  query getOptionalProjectData($projectPath: ID!, $rootNamespacePath: ID!) {
    project(fullPath: $projectPath) {
      id
      namespace {
        id
      }
    }
    rootNamespace: namespace(fullPath: $rootNamespacePath) {
      id
    }
  }
`;

export const GET_WORKFLOW_ENABLEMENT_CHECKS_QUERY = gql`
  query getDuoWorkflowEnablementChecks($projectPath: ID!) {
    project(fullPath: $projectPath) {
      id
      duoWorkflowStatusCheck {
        enabled
        checks {
          name
          value
          message
        }
      }
    }
  }
`;

export const GET_WORKFLOW_EVENTS_QUERY = gql`
  query getDuoWorkflowEvents($workflowId: AiDuoWorkflowsWorkflowID!) {
    duoWorkflowEvents(workflowId: $workflowId) {
      nodes {
        checkpoint
        errors
        workflowGoal
        workflowStatus
      }
    }
    duoWorkflowWorkflows(workflowId: $workflowId) {
      nodes {
        id
        status
        project {
          fullPath
        }
      }
    }
  }
`;

export const GET_LATEST_CHECKPOINT_QUERY = gql`
  query getLatestCheckpoint($workflowId: AiDuoWorkflowsWorkflowID!) {
    duoWorkflowWorkflows(workflowId: $workflowId) {
      nodes {
        project {
          fullPath
        }
        latestCheckpoint {
          checkpoint
          errors
          workflowGoal
          workflowStatus
        }
      }
    }
  }
`;

export const GET_USER_WORKFLOWS = gql`
  query getUserWorkflows($type: String, $after: String, $before: String, $first: Int, $last: Int) {
    duoWorkflowWorkflows(type: $type, first: $first, after: $after, last: $last, before: $before) {
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
          updatedAt
          goal
          stalled
          archived
          ...workflowAgent
          firstCheckpoint {
            checkpoint
          }
        }
      }
    }
  }
`;

export const AI_CATALOG_VERSION_ID_FRAGMENT = {
  lt: gql`
    fragment workflowAgent on DuoWorkflow {
      id
    }
  `,
  gte: gql`
    fragment workflowAgent on DuoWorkflow {
      aiCatalogItemVersionId
    }
  `,
  version: '18.4.0',
};

export const DELETE_DUO_WORKFLOWS_WORKFLOW = gql`
  mutation deleteDuoWorkflowsWorkflow($input: DeleteDuoWorkflowsWorkflowInput!) {
    deleteDuoWorkflowsWorkflow(input: $input) {
      clientMutationId
      errors
      success
    }
  }
`;

export const GET_CONFIGURED_AGENTS = gql`
  query getConfiguredAgents($projectId: ProjectID!) {
    ...aiCatalogConfiguredItems
    metadata {
      version
    }
  }
`;

export const GET_CONFIGURED_AGENTS_18_4_1_AND_EARLIER = gql`
  fragment aiCatalogConfiguredItems on Query {
    aiCatalogConfiguredItems: aiCatalogItemConsumers(projectId: $projectId, itemType: AGENT) {
      nodes {
        id
        item {
          id
          name
          description
          latestVersion {
            id
          }
        }
      }
    }
  }
`;

export const GET_CONFIGURED_AGENTS_18_4_2_AND_LATER = gql`
  fragment aiCatalogConfiguredItems on Query {
    aiCatalogConfiguredItems(projectId: $projectId, itemType: AGENT) {
      nodes {
        id
        pinnedItemVersion @gl_introduced(version: "18.6.0") {
          id
        }
        item {
          id
          name
          description
          latestVersion {
            id
          }
        }
      }
    }
  }
`;

export const GET_AGENT_FLOW_CONFIG = gql`
  query getAgentFlowConfig($agentVersionId: AiCatalogItemVersionID!) {
    aiCatalogAgentFlowConfig(agentVersionId: $agentVersionId, flowConfigType: CHAT)
  }
`;
