import { defineStore } from 'pinia';
import { coerce, gte } from 'semver';
import {
  GET_AGENT_FLOW_CONFIG,
  GET_CONFIGURED_AGENTS,
  GET_CONFIGURED_AGENTS_18_4_1_AND_EARLIER,
  GET_CONFIGURED_AGENTS_18_4_2_AND_LATER,
} from '@gitlab-lsp/workflow-api';

export const DEFAULT_AGENT = {
  id: 'gid://gitlab/Ai::Catalog::FoundationalChatAgent/1',
  name: 'GitLab Duo Agent',
  referenceWithVersion: 'chat',
  description: 'Duo is your general development assistant',
  foundational: true,
};

export const useAgentStore = defineStore('agents', {
  state: () => ({
    catalogAgents: [],
    foundationalAgents: [DEFAULT_AGENT],
    flowConfig: '',
    agentVersionId: '',
    workflowDefinition: 'chat',
  }),
  getters: {
    agents: (state) =>
      [...state.foundationalAgents, ...state.catalogAgents]
        .filter((agent) => agent.selectableInChat !== false)
        .map((agent) => ({
          ...agent,
          text: agent.name,
        })),
  },
  actions: {
    fetchCatalogAgents(projectId) {
      this.sendGraphqlRequest({
        eventName: 'setCatalogAgents',
        query: GET_CONFIGURED_AGENTS,
        fragment: {
          version: '18.4.2',
          gte: GET_CONFIGURED_AGENTS_18_4_2_AND_LATER,
          lt: GET_CONFIGURED_AGENTS_18_4_1_AND_EARLIER,
        },
        variables: {
          projectId,
        },
        supportedSinceInstanceVersion: {
          version: '18.4.0',
          resourceName: 'AI Catalog Configured Agents',
        },
      });
    },
    fetchFoundationalAgents(projectId, namespaceId) {
      this.sendGraphqlRequest({
        eventName: 'setFoundationalAgents',
        operationName: 'aiFoundationalAgents',
        variables: {
          projectId,
          namespaceId,
        },
        supportedSinceInstanceVersion: {
          version: '18.6.0',
          resourceName: 'AI Foundational Chat agents',
        },
      });
    },
    setCatalogAgents(result) {
      // Strip suffixes such as `-pre` and `-ee`
      const instanceVersion = coerce(result?.metadata?.version || '0.0.0');

      const catalogAgents = [];

      (result?.aiCatalogConfiguredItems?.nodes ?? []).forEach((node) => {
        // GitLab instances 18.7+ have the `pinnedItemVersion` field, which returns
        // the version of the item at the version it was pinned. Earlier instances
        // did not have this field, and the feature was experimental and not released,
        // and so we allow a fallback to `latestVersion`. This fallback is not safe
        // for 18.7+
        if (gte(instanceVersion, '18.7.0')) {
          if (!node.pinnedItemVersion) {
            // Do not add this agent
            return;
          }
          // Add the agent using the pinned version
          catalogAgents.push({
            ...node.item,
            pinnedItemVersionId: node.pinnedItemVersion?.id,
          });
        } else {
          // Add the agent using the latest version
          catalogAgents.push({
            ...node.item,
            pinnedItemVersionId: node.item.latestVersion?.id,
          });
        }

        this.catalogAgents = catalogAgents;
      });
    },
    setFoundationalAgents(result) {
      this.foundationalAgents = (result?.aiFoundationalChatAgents?.nodes ?? [DEFAULT_AGENT]).map(
        // this needs to be according to the query
        (agent) => ({ ...agent, foundational: true }),
      );
    },
    setAgentByReference(agentVersionId, workflowDefinition) {
      if (agentVersionId) {
        this.agentVersionId = agentVersionId;
        this.workflowDefinition = '';
        this.getAgentFlowConfig(this.agentVersionId);
      } else {
        this.flowConfig = '';
        this.workflowDefinition = workflowDefinition;
        this.agentVersionId = '';
      }
    },
    getAgentFlowConfig(agentVersionId) {
      this.sendGraphqlRequest({
        eventName: 'setFlowConfig',
        query: GET_AGENT_FLOW_CONFIG,
        variables: {
          agentVersionId,
        },
        supportedSinceInstanceVersion: {
          version: '18.4.0',
          resourceName: 'AI Catalog Agent Flow Config',
        },
      });
    },
    setFlowConfig(result) {
      this.flowConfig = result?.aiCatalogAgentFlowConfig ?? '';
    },
  },
  events: {
    setFlowConfig: 'setFlowConfig',
    setCatalogAgents: 'setCatalogAgents',
    setFoundationalAgents: 'setFoundationalAgents',
  },
});
