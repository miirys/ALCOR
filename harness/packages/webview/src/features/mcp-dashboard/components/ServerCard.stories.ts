import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type { McpServerState, ServerName } from '../types/mcp';
import { ConnectionState } from '../types/mcp';
import ServerCard from './ServerCard.vue';

// One mock server per ConnectionState (data mirrors mockMcpService) so the story shows each card's distinct styling.
const servers: McpServerState[] = [
  {
    name: 'gitlab' as ServerName,
    displayName: 'gitlab',
    config: {
      type: 'http',
      url: new URL('https://gitlab.com/api/v4/mcp'),
      headers: { Authorization: 'Bearer ***' },
      approvedTools: ['gitlab_search_code', 'gitlab_get_issue', 'gitlab_create_merge_request'],
    },
    connectionState: ConnectionState.Connected,
    connectedAt: new Date(Date.now() - 120000),
    configSource: '/Users/user/workspace/.gitlab/mcp-config.json',
    serverInfo: { name: 'gitlab-mcp-server', title: 'GitLab MCP Server', version: '1.0.0' },
  },
  {
    name: 'context7' as ServerName,
    displayName: 'context7',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
      approvedTools: true,
    },
    connectionState: ConnectionState.Connecting,
    configSource: '/Users/user/workspace/.gitlab/mcp-config.json',
    serverInfo: { name: 'context7-mcp', title: 'Context7 Documentation Server', version: '1.0.18' },
  },
  {
    name: 'grafana' as ServerName,
    displayName: 'Grafana',
    config: {
      type: 'stdio',
      command: 'mcp-grafana',
      env: { GRAFANA_URL: 'https://myinstance.grafana.net', GRAFANA_SERVICE_ACCOUNT_TOKEN: '***' },
      approvedTools: ['grafana_search_dashboards', 'grafana_query_datasource'],
    },
    connectionState: ConnectionState.Failed,
    error: 'Invalid service account token',
    // User-level path (outside the workspace) exercises the non-workspace config badge.
    configSource: '/Users/user/.config/gitlab/mcp-config-local.json',
  },
  {
    name: 'atlassian' as ServerName,
    displayName: 'Atlassian',
    config: {
      type: 'http',
      url: new URL('https://api.atlassian.com/mcp'),
      headers: { Authorization: 'Bearer ***' },
      approvedTools: ['jira_search_issues', 'confluence_search_pages'],
    },
    connectionState: ConnectionState.Disconnected,
    configSource: '/Users/user/workspace/.gitlab/mcp-config.json',
    serverInfo: {
      name: 'atlassian-remote-mcp',
      title: 'Atlassian Remote MCP Server',
      version: '1.0.0',
    },
  },
  {
    name: 'auth-server' as ServerName,
    displayName: 'Auth Server',
    config: {
      type: 'http',
      url: new URL('https://example.com/mcp'),
      headers: { Authorization: 'Bearer ***' },
      approvedTools: [],
    },
    connectionState: ConnectionState.Authenticating,
    authUrl: 'https://example.com/oauth/authorize',
    configSource: '/Users/user/workspace/.gitlab/mcp-config.json',
  },
];

const meta = {
  title: 'mcp-dashboard/ServerCard',
  component: ServerCard,
  parameters: {
    a11y: { test: 'todo' },
  },
} satisfies Meta<typeof ServerCard>;

export default meta;
type Story = StoryObj<typeof meta>;
const stateLabels: Record<ConnectionState, string> = {
  [ConnectionState.Connecting]: 'Connecting',
  [ConnectionState.Authenticating]: 'Authenticating',
  [ConnectionState.Connected]: 'Connected',
  [ConnectionState.Disconnected]: 'Disconnected',
  [ConnectionState.Failed]: 'Failed',
};

export const Panel: Story = {
  render: () => ({
    components: { ServerCard },
    setup() {
      return { servers, stateLabels };
    },
    template: `
      <div style="width: 360px; padding: 16px; background: var(--editor-background, #2b2d30); display: flex; flex-direction: column; gap: 20px;">
        <section v-for="s in servers" :key="s.name" style="display: flex; flex-direction: column; gap: 8px;">
          <h2 style="margin: 0; color: var(--editor-foreground, #fff); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.65;">
            {{ stateLabels[s.connectionState] }}
          </h2>
        <ServerCard
          :server="s"
          :tool-count="3"
          :approved-tool-count="2"
          workspace-uri="file:///Users/user/workspace"
        />
        </section>
      </div>
    `,
  }),
};
