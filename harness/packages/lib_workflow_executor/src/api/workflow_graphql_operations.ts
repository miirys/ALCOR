import {
  DELETE_DUO_WORKFLOWS_WORKFLOW,
  GET_PROJECT_DATA,
  GET_USER_WORKFLOWS,
  GET_WORKFLOW_ENABLEMENT_CHECKS_QUERY,
  GET_WORKFLOW_EVENTS_QUERY,
  GET_CONFIGURED_AGENTS,
  GET_AGENT_FLOW_CONFIG,
  GET_LATEST_CHECKPOINT_QUERY,
} from '@gitlab-lsp/workflow-api';
import { createInterfaceId, Injectable } from '@gitlab/needle';

export interface WorkflowGraphqlOperations {
  containsQuery(query: string | null): boolean;
}

export const WorkflowGraphqlOperations = createInterfaceId<WorkflowGraphqlOperations>(
  'WorkflowGraphqlOperations',
);

@Injectable(WorkflowGraphqlOperations, [])
export class DefaultWorkflowGraphqlOperations implements WorkflowGraphqlOperations {
  #queries = [
    GET_PROJECT_DATA,
    GET_WORKFLOW_ENABLEMENT_CHECKS_QUERY,
    GET_WORKFLOW_EVENTS_QUERY,
    GET_USER_WORKFLOWS,
    DELETE_DUO_WORKFLOWS_WORKFLOW,
    GET_CONFIGURED_AGENTS,
    GET_AGENT_FLOW_CONFIG,
    GET_LATEST_CHECKPOINT_QUERY,
  ];

  containsQuery(query: string | null): boolean {
    return query !== null && this.#queries.includes(query);
  }
}
