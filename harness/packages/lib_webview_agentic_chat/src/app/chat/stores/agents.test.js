import { setActivePinia, createPinia } from 'pinia';
import {
  GET_AGENT_FLOW_CONFIG,
  GET_CONFIGURED_AGENTS,
  GET_CONFIGURED_AGENTS_18_4_1_AND_EARLIER,
  GET_CONFIGURED_AGENTS_18_4_2_AND_LATER,
} from '@gitlab-lsp/workflow-api';
import {
  mockMessageBusBridge,
  mockWorkflowStoreEvents,
} from '../../test_utils/mock_workflow_store_plugin';
import { useAgentStore, DEFAULT_AGENT } from './agents';

describe('Agent Store', () => {
  let agentStore;

  beforeEach(() => {
    const pinia = createPinia();
    pinia.use(mockWorkflowStoreEvents);
    setActivePinia(pinia);
    agentStore = useAgentStore();
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('has correct initial state', () => {
      expect(agentStore.catalogAgents).toEqual([]);
      expect(agentStore.foundationalAgents).toEqual([DEFAULT_AGENT]);
      expect(agentStore.flowConfig).toBe('');
      expect(agentStore.agentVersionId).toBe('');
    });
  });

  describe('getters', () => {
    describe('agents', () => {
      it('returns default agent when no catalog agents exist', () => {
        expect(agentStore.agents).toEqual([
          {
            id: 'gid://gitlab/Ai::Catalog::FoundationalChatAgent/1',
            name: 'GitLab Duo Agent',
            text: 'GitLab Duo Agent',
            referenceWithVersion: 'chat',
            description: 'Duo is your general development assistant',
            foundational: true,
          },
        ]);
      });

      it('excludes agents with selectableInChat set to false', () => {
        agentStore.foundationalAgents = [
          {
            id: 'gid://gitlab/Ai::Catalog::FoundationalChatAgent/1',
            name: 'GitLab Duo Agent',
            referenceWithVersion: 'chat',
            description: 'Duo is your general development assistant',
            foundational: true,
          },
          {
            id: 'gid://gitlab/Ai::Catalog::FoundationalChatAgent/2',
            name: 'Hidden Agent',
            referenceWithVersion: 'hidden_agent/v1',
            description: 'Should not appear in picker',
            foundational: true,
            selectableInChat: false,
          },
        ];

        expect(agentStore.agents).toHaveLength(1);
        expect(agentStore.agents[0].name).toBe('GitLab Duo Agent');
      });

      it('includes agents with selectableInChat set to true', () => {
        agentStore.foundationalAgents = [
          {
            id: 'gid://gitlab/Ai::Catalog::FoundationalChatAgent/1',
            name: 'GitLab Duo Agent',
            referenceWithVersion: 'chat',
            description: 'Duo is your general development assistant',
            foundational: true,
            selectableInChat: true,
          },
        ];

        expect(agentStore.agents).toHaveLength(1);
        expect(agentStore.agents[0].name).toBe('GitLab Duo Agent');
      });

      it('includes agents without selectableInChat field (defaults to selectable)', () => {
        agentStore.foundationalAgents = [
          {
            id: 'gid://gitlab/Ai::Catalog::FoundationalChatAgent/1',
            name: 'GitLab Duo Agent',
            referenceWithVersion: 'chat',
            description: 'Duo is your general development assistant',
            foundational: true,
          },
        ];

        expect(agentStore.agents).toHaveLength(1);
      });

      it('returns foundational agents plus catalog agents with text property', () => {
        agentStore.catalogAgents = [
          { name: 'Custom Agent 1', description: 'First custom agent' },
          { name: 'Custom Agent 2', description: 'Second custom agent' },
        ];

        agentStore.foundationalAgents = [
          {
            id: 'gid://gitlab/Ai::Catalog::FoundationalChatAgent/1',
            name: 'GitLab Duo Agent',
            referenceWithVersion: 'chat',
            description: 'Duo is your general development assistant',
            foundational: true,
          },
          {
            id: 'gid://gitlab/Ai::Catalog::FoundationalChatAgent/2',
            name: 'Test agent',
            referenceWithVersion: 'test_agent/v1',
            description: 'A test agent',
            foundational: true,
          },
        ];

        expect(agentStore.agents).toEqual([
          {
            id: 'gid://gitlab/Ai::Catalog::FoundationalChatAgent/1',
            name: 'GitLab Duo Agent',
            text: 'GitLab Duo Agent',
            referenceWithVersion: 'chat',
            description: 'Duo is your general development assistant',
            foundational: true,
          },
          {
            id: 'gid://gitlab/Ai::Catalog::FoundationalChatAgent/2',
            name: 'Test agent',
            text: 'Test agent',
            referenceWithVersion: 'test_agent/v1',
            description: 'A test agent',
            foundational: true,
          },
          {
            name: 'Custom Agent 1',
            description: 'First custom agent',
            text: 'Custom Agent 1',
          },
          {
            name: 'Custom Agent 2',
            description: 'Second custom agent',
            text: 'Custom Agent 2',
          },
        ]);
      });
    });
  });

  describe('actions', () => {
    describe('fetchCatalogAgents', () => {
      it('sends GraphQL request with correct fragment configuration', () => {
        const projectId = 'project-123';

        agentStore.fetchCatalogAgents(projectId);

        expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
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
      });
    });

    describe('fetchFoundationalAgents', () => {
      it('sends GraphQL request with correct fragment configuration', () => {
        const projectId = 'project-123';
        const namespaceId = 'namespace-456';

        agentStore.fetchFoundationalAgents(projectId, namespaceId);

        expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
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
      });
    });

    describe('setFoundationalAgents', () => {
      it('sets foundational agents from GraphQL result', () => {
        const result = {
          aiFoundationalChatAgents: {
            nodes: [
              DEFAULT_AGENT,
              {
                id: 'gid://gitlab/Ai::FoundationalChatAgent/2',
                name: 'Documentation Helper',
                description: 'Assists with writing and improving documentation',
                referenceWithVersion: 'doc-helper@v2.1.0',
              },
            ],
          },
        };

        agentStore.setFoundationalAgents(result);

        expect(agentStore.foundationalAgents).toEqual([
          DEFAULT_AGENT,
          {
            id: 'gid://gitlab/Ai::FoundationalChatAgent/2',
            name: 'Documentation Helper',
            description: 'Assists with writing and improving documentation',
            referenceWithVersion: 'doc-helper@v2.1.0',
            foundational: true,
          },
        ]);
      });

      it('handles null result gracefully', () => {
        agentStore.setFoundationalAgents(null);
        expect(agentStore.foundationalAgents).toEqual([DEFAULT_AGENT]);
      });

      it('handles undefined result gracefully', () => {
        agentStore.setFoundationalAgents(undefined);
        expect(agentStore.foundationalAgents).toEqual([DEFAULT_AGENT]);
      });

      it('handles result with null nodes gracefully', () => {
        const result = {
          aiFoundationalChatAgents: {
            nodes: null,
          },
        };

        agentStore.setFoundationalAgents(result);
        expect(agentStore.foundationalAgents).toEqual([DEFAULT_AGENT]);
      });

      it('handles result with undefined nodes gracefully', () => {
        const result = {
          aiCatalogConfiguredItems: null,
        };

        agentStore.setFoundationalAgents(result);
        expect(agentStore.foundationalAgents).toEqual([DEFAULT_AGENT]);
      });
    });

    describe('setCatalogAgents', () => {
      it('(for 18.7.0 and above) sets catalog agents from GraphQL result with pinnedItemVersion', () => {
        const result = {
          aiCatalogConfiguredItems: {
            nodes: [
              {
                pinnedItemVersion: { id: 'version-1' },
                item: {
                  id: 'agent-1',
                  name: 'Custom Agent 1',
                  description: 'First custom agent',
                  latestVersion: { id: 'latest-version-1' },
                },
              },
              {
                pinnedItemVersion: { id: 'version-2' },
                item: {
                  id: 'agent-2',
                  name: 'Custom Agent 2',
                  description: 'Second custom agent',
                  latestVersion: { id: 'latest-version-1' },
                },
              },
            ],
          },
          metadata: {
            version: '18.7.0-pre',
          },
        };

        agentStore.setCatalogAgents(result);

        expect(agentStore.catalogAgents).toEqual([
          {
            id: 'agent-1',
            name: 'Custom Agent 1',
            description: 'First custom agent',
            pinnedItemVersionId: 'version-1',
            latestVersion: { id: 'latest-version-1' },
          },
          {
            id: 'agent-2',
            name: 'Custom Agent 2',
            description: 'Second custom agent',
            pinnedItemVersionId: 'version-2',
            latestVersion: { id: 'latest-version-1' },
          },
        ]);
      });

      it('(for 18.7.0 and above) prefers pinnedItemVersion over latestVersion when both are available', () => {
        const result = {
          aiCatalogConfiguredItems: {
            nodes: [
              {
                pinnedItemVersion: { id: 'pinned-version-1' },
                item: {
                  id: 'agent-1',
                  name: 'Custom Agent 1',
                  description: 'First custom agent',
                  latestVersion: { id: 'latest-version-1' },
                },
              },
            ],
          },
          metadata: {
            version: '18.7.0-pre',
          },
        };

        agentStore.setCatalogAgents(result);

        expect(agentStore.catalogAgents).toEqual([
          {
            id: 'agent-1',
            name: 'Custom Agent 1',
            description: 'First custom agent',
            pinnedItemVersionId: 'pinned-version-1',
            latestVersion: { id: 'latest-version-1' },
          },
        ]);
      });

      it('(for 18.7.0 and above) ignores agent when pinnedItemVersion is not available', () => {
        const result = {
          aiCatalogConfiguredItems: {
            nodes: [
              {
                pinnedItemVersion: { id: 'version-1' },
                item: {
                  id: 'agent-1',
                  name: 'Custom Agent 1',
                  description: 'First custom agent',
                  latestVersion: { id: 'latest-version-1' },
                },
              },
              {
                item: {
                  id: 'agent-2',
                  name: 'Custom Agent 2',
                  description: 'Second custom agent',
                  latestVersion: { id: 'latest-version-1' },
                },
              },
            ],
          },
          metadata: {
            version: '18.7.0-pre',
          },
        };

        agentStore.setCatalogAgents(result);

        expect(agentStore.catalogAgents).toEqual([
          {
            id: 'agent-1',
            name: 'Custom Agent 1',
            description: 'First custom agent',
            pinnedItemVersionId: 'version-1',
            latestVersion: { id: 'latest-version-1' },
          },
        ]);
      });

      it('(for 18.6.x) prefers latestVersion even when pinnedVersion is available', () => {
        const result = {
          aiCatalogConfiguredItems: {
            nodes: [
              {
                pinnedItemVersion: { id: 'pinned-version-1' },
                item: {
                  id: 'agent-1',
                  name: 'Custom Agent 1',
                  description: 'First custom agent',
                  latestVersion: { id: 'latest-version-1' },
                },
              },
              {
                pinnedItemVersion: null,
                item: {
                  id: 'agent-2',
                  name: 'Custom Agent 2',
                  description: 'Second custom agent',
                  latestVersion: { id: 'latest-version-2' },
                },
              },
            ],
          },
          metadata: {
            version: '18.6.0-pre',
          },
        };

        agentStore.setCatalogAgents(result);

        expect(agentStore.catalogAgents).toEqual([
          {
            id: 'agent-1',
            name: 'Custom Agent 1',
            description: 'First custom agent',
            latestVersion: { id: 'latest-version-1' },
            pinnedItemVersionId: 'latest-version-1',
          },
          {
            id: 'agent-2',
            name: 'Custom Agent 2',
            description: 'Second custom agent',
            latestVersion: { id: 'latest-version-2' },
            pinnedItemVersionId: 'latest-version-2',
          },
        ]);
      });

      it('(for 18.5.0) uses latestVersion when pinnedItemVersion is null', () => {
        const result = {
          aiCatalogConfiguredItems: {
            nodes: [
              {
                pinnedItemVersion: null,
                item: {
                  id: 'agent-1',
                  name: 'Custom Agent 1',
                  description: 'First custom agent',
                  latestVersion: { id: 'latest-version-1' },
                },
              },
              {
                pinnedItemVersion: null,
                item: {
                  id: 'agent-2',
                  name: 'Custom Agent 2',
                  description: 'Second custom agent',
                  latestVersion: { id: 'latest-version-2' },
                },
              },
            ],
          },
          metadata: {
            version: '18.5.0-pre',
          },
        };

        agentStore.setCatalogAgents(result);

        expect(agentStore.catalogAgents).toEqual([
          {
            id: 'agent-1',
            name: 'Custom Agent 1',
            description: 'First custom agent',
            latestVersion: { id: 'latest-version-1' },
            pinnedItemVersionId: 'latest-version-1',
          },
          {
            id: 'agent-2',
            name: 'Custom Agent 2',
            description: 'Second custom agent',
            latestVersion: { id: 'latest-version-2' },
            pinnedItemVersionId: 'latest-version-2',
          },
        ]);
      });

      it('handles null result gracefully', () => {
        agentStore.setCatalogAgents(null);
        expect(agentStore.catalogAgents).toEqual([]);
      });

      it('handles undefined result gracefully', () => {
        agentStore.setCatalogAgents(undefined);
        expect(agentStore.catalogAgents).toEqual([]);
      });

      it('handles result with null nodes gracefully', () => {
        const result = {
          aiCatalogConfiguredItems: {
            nodes: null,
          },
        };

        agentStore.setCatalogAgents(result);
        expect(agentStore.catalogAgents).toEqual([]);
      });

      it('handles result with undefined nodes gracefully', () => {
        const result = {
          aiCatalogConfiguredItems: null,
        };

        agentStore.setCatalogAgents(result);
        expect(agentStore.catalogAgents).toEqual([]);
      });
    });

    describe('setAgentByReference', () => {
      describe('when agent is foundational', () => {
        it('sets workflowDefinition', () => {
          const getAgentFlowConfigSpy = jest.spyOn(agentStore, 'getAgentFlowConfig');

          agentStore.setAgentByReference('', 'test_agent/v1');

          expect(agentStore.agentVersionId).toBe('');
          expect(agentStore.flowConfig).toBe('');
          expect(agentStore.workflowDefinition).toBe('test_agent/v1');
          expect(getAgentFlowConfigSpy).not.toHaveBeenCalled();
        });
      });

      describe('when agent is custom agent', () => {
        it('sets agentVersionId and fetches flow config', () => {
          const getAgentFlowConfigSpy = jest.spyOn(agentStore, 'getAgentFlowConfig');

          agentStore.setAgentByReference('version-456', 'test_agent/v1');

          expect(agentStore.agentVersionId).toBe('version-456');
          expect(agentStore.workflowDefinition).toBe('');
          expect(getAgentFlowConfigSpy).toHaveBeenCalledWith('version-456');
        });
      });
    });

    describe('getAgentFlowConfig', () => {
      it('sends GraphQL request with correct parameters', () => {
        const agentVersionId = 'version-123';

        agentStore.getAgentFlowConfig(agentVersionId);

        expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
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
      });
    });

    describe('setFlowConfig', () => {
      it('sets flow config from GraphQL result', () => {
        const result = {
          aiCatalogAgentFlowConfig: 'flow-config-yaml',
        };

        agentStore.setFlowConfig(result);

        expect(agentStore.flowConfig).toBe('flow-config-yaml');
      });

      it('handles null result gracefully', () => {
        agentStore.setFlowConfig(null);
        expect(agentStore.flowConfig).toBe('');
      });

      it('handles undefined result gracefully', () => {
        agentStore.setFlowConfig(undefined);
        expect(agentStore.flowConfig).toBe('');
      });

      it('handles result with null flow config gracefully', () => {
        const result = {
          aiCatalogAgentFlowConfig: null,
        };

        agentStore.setFlowConfig(result);
        expect(agentStore.flowConfig).toBe('');
      });

      it('handles result with undefined flow config gracefully', () => {
        const result = {};

        agentStore.setFlowConfig(result);
        expect(agentStore.flowConfig).toBe('');
      });
    });
  });

  describe('integration scenarios', () => {
    it('handles complete agent selection flow with fragment configuration', () => {
      const projectId = 'project-123';
      const agentVersionId = 'version-456';

      // Fetch catalog agents
      agentStore.fetchCatalogAgents(projectId);
      expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
        eventName: 'setCatalogAgents',
        query: GET_CONFIGURED_AGENTS,
        fragment: {
          version: '18.4.2',
          gte: GET_CONFIGURED_AGENTS_18_4_2_AND_LATER,
          lt: GET_CONFIGURED_AGENTS_18_4_1_AND_EARLIER,
        },
        variables: { projectId },
        supportedSinceInstanceVersion: {
          version: '18.4.0',
          resourceName: 'AI Catalog Configured Agents',
        },
      });

      // Set catalog agents result
      const catalogResult = {
        aiCatalogConfiguredItems: {
          nodes: [
            {
              pinnedItemVersion: { id: 'version-1' },
              item: {
                id: 'agent-1',
                name: 'Custom Agent',
                description: 'A custom agent',
              },
            },
          ],
        },
        metadata: {
          version: '18.7.0-pre',
        },
      };

      agentStore.setCatalogAgents(catalogResult);

      // Verify agents getter includes both default and catalog agents
      expect(agentStore.agents).toHaveLength(2);
      expect(agentStore.agents[0].name).toBe('GitLab Duo Agent');
      expect(agentStore.agents[1].name).toBe('Custom Agent');

      // Set custom agent
      agentStore.setAgentByReference(agentVersionId, '');

      expect(agentStore.agentVersionId).toBe(agentVersionId);
      expect(mockMessageBusBridge.sendGraphqlRequest).toHaveBeenCalledWith({
        eventName: 'setFlowConfig',
        query: GET_AGENT_FLOW_CONFIG,
        variables: { agentVersionId },
        supportedSinceInstanceVersion: {
          version: '18.4.0',
          resourceName: 'AI Catalog Agent Flow Config',
        },
      });

      // Set flow config result
      const flowConfigResult = {
        aiCatalogAgentFlowConfig: 'custom-flow-config',
      };
      agentStore.setFlowConfig(flowConfigResult);
      expect(agentStore.flowConfig).toBe('custom-flow-config');
    });

    it('handles agent deselection flow', () => {
      // Set up initial state
      agentStore.agentVersionId = 'version-123';
      agentStore.flowConfig = 'existing-config';

      // Deselect agent
      agentStore.setAgentByReference('', '');

      expect(agentStore.agentVersionId).toBe('');
      expect(agentStore.flowConfig).toBe('');
      expect(agentStore.workflowDefinition).toBe('');
    });
  });
});
