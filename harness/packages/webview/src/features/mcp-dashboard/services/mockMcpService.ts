import { McpToolName } from '@gitlab-org/ai-configuration-webview/contract';
import type {
  McpServerState,
  McpTool,
  ServerName,
  ToolExecutionResult,
  McpLogEntry,
  ConfigErrorDetails,
} from '../types/mcp';
import { ConnectionState, LogLevel } from '../types/mcp';
import type { IMcpService, McpServiceEvents } from './IMcpService';

type EventHandler = (...args: unknown[]) => void;

/**
 * Mock servers data
 */
const mockServers: McpServerState[] = [
  {
    name: 'gitlab' as ServerName,
    displayName: 'gitlab',
    config: {
      type: 'http',
      url: new URL('https://gitlab.com/api/v4/mcp'),
      headers: {
        Authorization: 'Bearer ***',
      },
      approvedTools: ['gitlab_search_code', 'gitlab_get_issue', 'gitlab_create_merge_request'],
    },
    connectionState: ConnectionState.Connected,
    connectedAt: new Date(Date.now() - 120000), // 2 minutes ago
    configSource: '/Users/user/workspace/.gitlab/mcp-config.json',
    scope: 'workspace',
    serverInfo: {
      name: 'gitlab-mcp-server',
      title: 'GitLab MCP Server',
      version: '1.0.0',
    },
  },
  {
    name: 'context7' as ServerName,
    displayName: 'context7',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
      approvedTools: true, // All tools approved
    },
    connectionState: ConnectionState.Connected,
    connectedAt: new Date(Date.now() - 300000), // 5 minutes ago
    configSource: '/Users/user/workspace/.gitlab/mcp-config.json',
    scope: 'workspace',
    serverInfo: {
      name: 'context7-mcp',
      title: 'Context7 Documentation Server',
      version: '1.0.18',
    },
  },
  {
    name: 'atlassian' as ServerName,
    displayName: 'Atlassian',
    config: {
      type: 'http',
      url: new URL('https://api.atlassian.com/mcp'),
      headers: {
        Authorization: 'Bearer ***',
      },
      oauth2: {
        clientId: 'atlassian-oauth-client',
        scopes: ['read:jira-work', 'read:confluence-content.all'],
      },
      approvedTools: ['jira_search_issues', 'confluence_search_pages'],
    },
    connectionState: ConnectionState.Disconnected,
    configSource: '/Users/user/workspace/.gitlab/mcp-config-local.json',
    scope: 'user',
    serverInfo: {
      name: 'atlassian-remote-mcp',
      title: 'Atlassian Remote MCP Server',
      version: '1.0.0',
    },
  },
  {
    name: 'grafana' as ServerName,
    displayName: 'Grafana',
    config: {
      type: 'stdio',
      command: 'mcp-grafana',
      env: {
        GRAFANA_URL: 'https://myinstance.grafana.net',
        GRAFANA_SERVICE_ACCOUNT_TOKEN: '***',
      },
      approvedTools: ['grafana_search_dashboards', 'grafana_query_datasource'],
    },
    connectionState: ConnectionState.Failed,
    error: 'Invalid service account token',
    configSource: '/Users/user/workspace/.gitlab/mcp-config-local.json',
    scope: 'user',
  },
];

/**
 * Mock tools data
 */
const gitlab = 'gitlab' as ServerName;
const context7 = 'context7' as ServerName;
const grafana = 'grafana' as ServerName;
const atlassian = 'atlassian' as ServerName;

const mockTools: McpTool[] = [
  // GitLab tools
  {
    name: McpToolName.create({ serverName: gitlab, toolName: 'search_code' }),
    serverName: gitlab,
    originalToolName: 'search_code',
    description: 'Search for code across GitLab repositories',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        scope: { type: 'string', enum: ['projects', 'blobs', 'issues'] },
      },
      required: ['query'],
    }),
    isApproved: true,
  },
  {
    name: McpToolName.create({ serverName: gitlab, toolName: 'get_issue' }),
    serverName: gitlab,
    originalToolName: 'get_issue',
    description: 'Get details about a specific GitLab issue',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        issue_iid: { type: 'number' },
      },
      required: ['project_id', 'issue_iid'],
    }),
    isApproved: true,
  },
  {
    name: McpToolName.create({ serverName: gitlab, toolName: 'create_merge_request' }),
    serverName: gitlab,
    originalToolName: 'create_merge_request',
    description: 'Create a new merge request in a GitLab project',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        source_branch: { type: 'string' },
        target_branch: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['project_id', 'source_branch', 'target_branch', 'title'],
    }),
    isApproved: true,
  },

  // Context7 tools
  {
    name: McpToolName.create({ serverName: context7, toolName: 'get_docs' }),
    serverName: context7,
    originalToolName: 'get_docs',
    description: 'Fetch up-to-date documentation for a library or framework',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        library: { type: 'string', description: 'Library or framework name' },
        version: { type: 'string', description: 'Optional version specifier' },
      },
      required: ['library'],
    }),
    isApproved: true,
  },
  {
    name: McpToolName.create({ serverName: context7, toolName: 'search_docs' }),
    serverName: context7,
    originalToolName: 'search_docs',
    description: 'Search documentation for specific topics or APIs',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        query: { type: 'string' },
        library: { type: 'string' },
      },
      required: ['query', 'library'],
    }),
    isApproved: true,
  },

  // Atlassian tools (disconnected)
  {
    name: McpToolName.create({ serverName: atlassian, toolName: 'search_issues' }),
    serverName: atlassian,
    originalToolName: 'search_issues',
    description: 'Search for Jira issues using JQL',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        jql: { type: 'string', description: 'JQL query string' },
        maxResults: { type: 'number' },
      },
      required: ['jql'],
    }),
    isApproved: false,
  },
  {
    name: McpToolName.create({ serverName: atlassian, toolName: 'search_pages' }),
    serverName: atlassian,
    originalToolName: 'search_pages',
    description: 'Search Confluence pages and content',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        query: { type: 'string' },
        spaceKey: { type: 'string' },
      },
      required: ['query'],
    }),
    isApproved: false,
  },

  // Grafana tools (failed connection, but tools are known)
  {
    name: McpToolName.create({ serverName: grafana, toolName: 'search_dashboards' }),
    serverName: grafana,
    originalToolName: 'search_dashboards',
    description: 'Search for dashboards in Grafana',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        query: { type: 'string' },
        tag: { type: 'string' },
      },
    }),
    isApproved: false,
  },
  {
    name: McpToolName.create({ serverName: grafana, toolName: 'query_datasource' }),
    serverName: grafana,
    originalToolName: 'query_datasource',
    description: 'Query a Grafana datasource',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        datasource: { type: 'string' },
        query: { type: 'string' },
      },
      required: ['datasource', 'query'],
    }),
    isApproved: false,
  },
];

/**
 * Mock execution history
 */
const mockExecutionHistory: ToolExecutionResult[] = [];

/**
 * Generate initial mock logs
 */
function generateInitialLogs(): McpLogEntry[] {
  const now = Date.now();
  const logs: McpLogEntry[] = [];
  let logId = 0;

  // GitLab server - successful connection with detailed flow
  logs.push(
    {
      id: `log-${++logId}`,
      serverName: 'gitlab' as ServerName,
      timestamp: new Date(now - 300000), // 5 min ago
      level: LogLevel.Info,
      message: 'Initializing connection to GitLab MCP server...',
    },
    {
      id: `log-${++logId}`,
      serverName: 'gitlab' as ServerName,
      timestamp: new Date(now - 299800),
      level: LogLevel.Debug,
      message: 'Resolving server endpoint: https://gitlab.com/api/v4/mcp',
    },
    {
      id: `log-${++logId}`,
      serverName: 'gitlab' as ServerName,
      timestamp: new Date(now - 299500),
      level: LogLevel.Debug,
      message: 'Sending MCP initialization handshake...',
    },
    {
      id: `log-${++logId}`,
      serverName: 'gitlab' as ServerName,
      timestamp: new Date(now - 299200),
      level: LogLevel.Info,
      message: 'Received server information',
      details: { name: 'gitlab-mcp-server', version: '1.0.0' },
    },
    {
      id: `log-${++logId}`,
      serverName: 'gitlab' as ServerName,
      timestamp: new Date(now - 299000),
      level: LogLevel.Info,
      message: 'Successfully connected to server',
    },
    {
      id: `log-${++logId}`,
      serverName: 'gitlab' as ServerName,
      timestamp: new Date(now - 298800),
      level: LogLevel.Debug,
      message: 'Requesting available tools from server...',
    },
    {
      id: `log-${++logId}`,
      serverName: 'gitlab' as ServerName,
      timestamp: new Date(now - 298500),
      level: LogLevel.Info,
      message:
        'Discovered 3 tools: gitlab_search_code, gitlab_get_issue, gitlab_create_merge_request',
    },
    {
      id: `log-${++logId}`,
      serverName: 'gitlab' as ServerName,
      timestamp: new Date(now - 298200),
      level: LogLevel.Debug,
      message: 'Loaded tool approval configuration: 3 tools pre-approved',
    },
    {
      id: `log-${++logId}`,
      serverName: 'gitlab' as ServerName,
      timestamp: new Date(now - 298000),
      level: LogLevel.Info,
      message: 'Server ready for tool execution',
    },
  );

  // Context7 server - successful connection
  logs.push(
    {
      id: `log-${++logId}`,
      serverName: 'context7' as ServerName,
      timestamp: new Date(now - 297000),
      level: LogLevel.Info,
      message: 'Starting stdio process: npx -y @upstash/context7-mcp',
    },
    {
      id: `log-${++logId}`,
      serverName: 'context7' as ServerName,
      timestamp: new Date(now - 296500),
      level: LogLevel.Debug,
      message: 'Process started with PID 12345',
    },
    {
      id: `log-${++logId}`,
      serverName: 'context7' as ServerName,
      timestamp: new Date(now - 296200),
      level: LogLevel.Info,
      message: 'MCP handshake completed',
      details: { name: 'context7-mcp', version: '1.0.18' },
    },
    {
      id: `log-${++logId}`,
      serverName: 'context7' as ServerName,
      timestamp: new Date(now - 296000),
      level: LogLevel.Info,
      message: 'Discovered 2 tools: context7_get_docs, context7_search_docs',
    },
  );

  // Atlassian server - connection issues
  logs.push(
    {
      id: `log-${++logId}`,
      serverName: 'atlassian' as ServerName,
      timestamp: new Date(now - 240000), // 4 min ago
      level: LogLevel.Info,
      message: 'Connecting to Atlassian remote MCP server...',
    },
    {
      id: `log-${++logId}`,
      serverName: 'atlassian' as ServerName,
      timestamp: new Date(now - 239500),
      level: LogLevel.Debug,
      message: 'Checking OAuth2 credentials...',
    },
    {
      id: `log-${++logId}`,
      serverName: 'atlassian' as ServerName,
      timestamp: new Date(now - 239000),
      level: LogLevel.Warning,
      message: 'OAuth2 token requires refresh',
    },
    {
      id: `log-${++logId}`,
      serverName: 'atlassian' as ServerName,
      timestamp: new Date(now - 238500),
      level: LogLevel.Info,
      message: 'Attempting to refresh OAuth2 token...',
    },
    {
      id: `log-${++logId}`,
      serverName: 'atlassian' as ServerName,
      timestamp: new Date(now - 238000),
      level: LogLevel.Warning,
      message: 'Token refresh failed - connection interrupted',
    },
    {
      id: `log-${++logId}`,
      serverName: 'atlassian' as ServerName,
      timestamp: new Date(now - 180000), // 3 min ago
      level: LogLevel.Warning,
      message: 'Server disconnected - will retry in 30 seconds',
    },
  );

  // Grafana server - connection failures
  logs.push(
    {
      id: `log-${++logId}`,
      serverName: 'grafana' as ServerName,
      timestamp: new Date(now - 150000), // 2.5 min ago
      level: LogLevel.Info,
      message: 'Starting Grafana MCP server process...',
    },
    {
      id: `log-${++logId}`,
      serverName: 'grafana' as ServerName,
      timestamp: new Date(now - 149500),
      level: LogLevel.Debug,
      message: 'Environment variables loaded: GRAFANA_URL, GRAFANA_SERVICE_ACCOUNT_TOKEN',
    },
    {
      id: `log-${++logId}`,
      serverName: 'grafana' as ServerName,
      timestamp: new Date(now - 149000),
      level: LogLevel.Error,
      message: 'Authentication failed: Invalid or expired service account token',
    },
    {
      id: `log-${++logId}`,
      serverName: 'grafana' as ServerName,
      timestamp: new Date(now - 148500),
      level: LogLevel.Debug,
      message: 'HTTP 401 response from https://myinstance.grafana.net/api/serviceaccounts',
    },
    {
      id: `log-${++logId}`,
      serverName: 'grafana' as ServerName,
      timestamp: new Date(now - 148000),
      level: LogLevel.Error,
      message: 'Connection failed: Invalid service account token',
    },
    {
      id: `log-${++logId}`,
      serverName: 'grafana' as ServerName,
      timestamp: new Date(now - 147500),
      level: LogLevel.Info,
      message: 'Process terminated with exit code 1',
    },
  );

  // Recent activity on GitLab server
  logs.push(
    {
      id: `log-${++logId}`,
      serverName: 'gitlab' as ServerName,
      timestamp: new Date(now - 60000), // 1 min ago
      level: LogLevel.Debug,
      message: 'Heartbeat check successful - server responding',
    },
    {
      id: `log-${++logId}`,
      serverName: 'gitlab' as ServerName,
      timestamp: new Date(now - 30000), // 30 sec ago
      level: LogLevel.Info,
      message: 'Tool approval configuration updated',
      details: { approvedTools: 3 },
    },
    {
      id: `log-${++logId}`,
      serverName: 'gitlab' as ServerName,
      timestamp: new Date(now - 10000), // 10 sec ago
      level: LogLevel.Debug,
      message: 'Connection stable - uptime: 5m 2s',
    },
  );

  return logs;
}

/**
 * Mock logs
 */
const mockLogs: McpLogEntry[] = generateInitialLogs();

/**
 * Mock MCP Service
 */
export class MockMcpService implements IMcpService {
  #servers: McpServerState[] = [...mockServers];

  #tools: McpTool[] = [...mockTools];

  #executionHistory: ToolExecutionResult[] = [...mockExecutionHistory];

  #logs: McpLogEntry[] = [...mockLogs];

  #logIdCounter = 0;

  #eventHandlers: Map<keyof McpServiceEvents, EventHandler[]> = new Map();

  #initialized = false;

  /**
   * Initialize the service
   * @param workspaceUri - Optional workspace URI (not used in mock)
   */
  async initialize(workspaceUri?: string): Promise<void> {
    if (this.#initialized) return;

    // Mock service doesn't need workspace URI, but we accept it for interface compatibility
    if (workspaceUri) {
      // eslint-disable-next-line no-console
      console.log('[MockMcpService] Initialized with workspace:', workspaceUri);
    }

    this.#initialized = true;
  }

  /**
   * Get the current workspace URI (mock returns a fake workspace)
   */
  async getWorkspaceUri(): Promise<string | null> {
    await this.#delay(100);
    return 'file:///Users/user/workspace';
  }

  /**
   * Dispose the service and clean up resources
   */
  async dispose(): Promise<void> {
    this.#eventHandlers.clear();
    this.#initialized = false;
  }

  /**
   * Register an event listener
   */
  on<K extends keyof McpServiceEvents>(event: K, handler: McpServiceEvents[K]): void {
    if (!this.#eventHandlers.has(event)) {
      this.#eventHandlers.set(event, []);
    }
    const handlers = this.#eventHandlers.get(event);
    if (handlers) {
      handlers.push(handler as EventHandler);
    }
  }

  /**
   * Unregister an event listener
   */
  off<K extends keyof McpServiceEvents>(event: K, handler: McpServiceEvents[K]): void {
    const handlers = this.#eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler as EventHandler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event to registered listeners
   */
  #emit<K extends keyof McpServiceEvents>(
    event: K,
    ...args: Parameters<McpServiceEvents[K]>
  ): void {
    const handlers = this.#eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(...args));
    }
  }

  /**
   * Get all servers
   */
  async getServers(): Promise<McpServerState[]> {
    // Simulate network delay
    await this.#delay(300);
    return this.#servers;
  }

  /**
   * Get a specific server by name
   */
  async getServer(serverName: ServerName): Promise<McpServerState | null> {
    await this.#delay(100);
    return this.#servers.find((s) => s.name === serverName) || null;
  }

  /**
   * Get all tools
   */
  async getTools(): Promise<McpTool[]> {
    // Simulate network delay
    await this.#delay(300);
    return this.#tools;
  }

  /**
   * Get tools for a specific server
   */
  async getToolsForServer(serverName: ServerName): Promise<McpTool[]> {
    await this.#delay(200);
    return this.#tools.filter((tool) => tool.serverName === serverName);
  }

  /**
   * Reload servers (smart reload - simulate checking if reconnect needed)
   */
  async reloadServers(): Promise<void> {
    // Smart reload: only reconnect if needed (for mock, we'll just skip already connected)
    const serversToReload = this.#servers.filter(
      (s) => s.connectionState !== ConnectionState.Connected,
    );

    if (serversToReload.length === 0) {
      this.#addLog(
        this.#generateLog(
          'system' as ServerName,
          LogLevel.Info,
          'All servers already connected, skipping reload',
        ),
      );
      return;
    }

    // Set servers to Connecting state
    this.#servers = this.#servers.map((server) => {
      if (serversToReload.some((s) => s.name === server.name)) {
        const updated = { ...server, connectionState: ConnectionState.Connecting };
        this.#emit('server:state-changed', server.name, updated);
        this.#addLog(
          this.#generateLog(server.name, LogLevel.Info, `Attempting to connect to server...`),
        );
        return updated;
      }
      return server;
    });

    // Simulate connection delay
    await this.#delay(2000);

    // Then update to final state
    this.#servers = this.#servers.map((server) => {
      if (
        server.connectionState === ConnectionState.Connecting ||
        server.connectionState === ConnectionState.Disconnected
      ) {
        const updated = {
          ...server,
          connectionState: ConnectionState.Connected,
          connectedAt: new Date(),
          error: undefined,
        };
        this.#emit('server:connected', server.name, updated);
        this.#addLog(
          this.#generateLog(server.name, LogLevel.Info, `Successfully connected to server`, {
            version: server.serverInfo?.version,
            toolCount: this.#tools.filter((t) => t.serverName === server.name).length,
          }),
        );
        return updated;
      }
      return server;
    });
  }

  /**
   * Restart all servers (force reconnect all)
   */
  async restartAllServers(): Promise<void> {
    // Force restart: always reconnect all servers
    this.#servers = this.#servers.map((server) => {
      const updated = { ...server, connectionState: ConnectionState.Connecting };
      this.#emit('server:state-changed', server.name, updated);
      this.#addLog(this.#generateLog(server.name, LogLevel.Info, `Force restarting server...`));
      return updated;
    });

    // Simulate connection delay
    await this.#delay(2000);

    // Update all servers to final state
    this.#servers = this.#servers.map((server) => {
      const updated = {
        ...server,
        connectionState: ConnectionState.Connected,
        connectedAt: new Date(),
        error: undefined,
      };
      this.#emit('server:connected', server.name, updated);
      this.#addLog(
        this.#generateLog(server.name, LogLevel.Info, `Server restarted successfully`, {
          version: server.serverInfo?.version,
          toolCount: this.#tools.filter((t) => t.serverName === server.name).length,
        }),
      );
      return updated;
    });
  }

  /**
   * Restart a single server (force reconnect)
   */
  async restartServer(serverName: ServerName): Promise<void> {
    const server = this.#servers.find((s) => s.name === serverName);
    if (!server) {
      throw new Error(`Server not found: ${serverName}`);
    }

    // Force restart: always reconnect
    this.#servers = this.#servers.map((s) => {
      if (s.name === serverName) {
        const updated = { ...s, connectionState: ConnectionState.Connecting };
        this.#emit('server:state-changed', serverName, updated);
        this.#addLog(this.#generateLog(serverName, LogLevel.Info, `Force restarting server...`));
        return updated;
      }
      return s;
    });

    // Simulate connection delay
    await this.#delay(2000);

    // Update specific server to final state
    this.#servers = this.#servers.map((s) => {
      if (s.name === serverName) {
        const updated = {
          ...s,
          connectionState: ConnectionState.Connected,
          connectedAt: new Date(),
          error: undefined,
        };
        this.#emit('server:connected', serverName, updated);
        this.#addLog(
          this.#generateLog(serverName, LogLevel.Info, `Server restarted successfully`, {
            version: s.serverInfo?.version,
          }),
        );
        return updated;
      }
      return s;
    });
  }

  async startAuthentication(serverName: ServerName): Promise<void> {
    const server = this.#servers.find((s) => s.name === serverName);
    if (!server) {
      throw new Error(`Server not found: ${serverName}`);
    }

    // In real implementation, would open auth URL
    // eslint-disable-next-line no-console
    console.log(`[MockMcpService] Opening auth URL for ${serverName}:`, server.authUrl);
    this.#addLog(this.#generateLog(serverName, LogLevel.Info, 'Starting authentication flow...'));
  }

  /**
   * Execute a tool
   */
  async executeTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    await this.#delay(800);

    const tool = this.#tools.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Simulate successful execution
    const result = {
      toolName,
      success: true,
      result: JSON.stringify({
        message: `Mock execution of ${toolName}`,
        args,
        timestamp: new Date().toISOString(),
      }),
      executedAt: new Date(),
    };

    this.#executionHistory.push(result);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return result.result!;
  }

  /**
   * Get execution history
   */
  async getExecutionHistory(): Promise<ToolExecutionResult[]> {
    await this.#delay(100);
    return [...this.#executionHistory];
  }

  /**
   * Simulate a server connection state change
   * (useful for testing UI updates)
   */
  simulateConnectionChange(
    serverName: ServerName,
    newState: ConnectionState,
    error?: string,
  ): void {
    this.#servers = this.#servers.map((server) => {
      if (server.name === serverName) {
        return {
          ...server,
          connectionState: newState,
          error,
          connectedAt: newState === ConnectionState.Connected ? new Date() : server.connectedAt,
        };
      }
      return server;
    });
  }

  /**
   * Helper to simulate async delay
   */
  #delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Helper to generate a log entry
   */
  #generateLog(
    serverName: ServerName,
    level: LogLevel,
    message: string,
    details?: Record<string, unknown>,
  ): McpLogEntry {
    return {
      id: `log-${++this.#logIdCounter}-${Date.now()}`,
      serverName,
      timestamp: new Date(),
      level,
      message,
      details,
    };
  }

  /**
   * Add a log entry
   */
  #addLog(log: McpLogEntry): void {
    this.#logs.push(log);
    // Keep only the last 1000 logs
    if (this.#logs.length > 1000) {
      this.#logs = this.#logs.slice(-1000);
    }
  }

  /**
   * Get all logs
   */
  async getLogs(): Promise<McpLogEntry[]> {
    await this.#delay(100);
    return [...this.#logs];
  }

  /**
   * Get logs for a specific server
   */
  async getLogsForServer(serverName: ServerName): Promise<McpLogEntry[]> {
    await this.#delay(100);
    return this.#logs.filter((log) => log.serverName === serverName);
  }

  /**
   * Clear logs for a specific server
   */
  async clearLogsForServer(serverName: ServerName): Promise<void> {
    this.#logs = this.#logs.filter((log) => log.serverName !== serverName);
  }

  // ===== Configuration Operations =====

  /**
   * Get available config file paths
   */
  async getConfigPaths(): Promise<{ workspace: string | null; user: string | null }> {
    await this.#delay(100);
    return {
      workspace: '/Users/user/workspace/.gitlab/duo/mcp.json',
      user: '/Users/user/.config/gitlab-duo/mcp.json',
    };
  }

  /**
   * Check if a config file is managed by our tooling
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async isManagedConfig(_filePath: string): Promise<boolean> {
    await this.#delay(100);
    // For mock service, return false to simulate existing unmanaged files
    // After a save operation, this would return true in real implementation
    return false;
  }

  /**
   * Save server configuration to specified file
   */
  async saveServer(
    serverName: ServerName,
    config: unknown,
    targetFile: 'workspace' | 'user',
  ): Promise<{ success: true } | { success: false; error: string; details?: ConfigErrorDetails }> {
    await this.#delay(500);

    // eslint-disable-next-line no-console
    console.log(`[MockMcpService] Saving server "${serverName}" to ${targetFile} file`, config);

    // Simulate successful save
    this.#addLog(
      this.#generateLog(serverName, LogLevel.Info, `Configuration saved to ${targetFile} file`, {
        targetFile,
      }),
    );

    // Add or update the server in our mock data
    const existingIndex = this.#servers.findIndex((s) => s.name === serverName);
    if (existingIndex >= 0 && this.#servers[existingIndex]) {
      // Update existing server - preserve all fields except config
      this.#servers[existingIndex] = {
        ...this.#servers[existingIndex],
        config,
      };
    } else {
      // New server
      this.#servers.push({
        name: serverName,
        displayName: serverName,
        config,
        connectionState: ConnectionState.Disconnected,
        configSource:
          targetFile === 'workspace'
            ? '/Users/user/workspace/.gitlab/duo/mcp.json'
            : '/Users/user/.config/gitlab-duo/mcp.json',
        scope: targetFile,
      });
    }

    return { success: true };
  }

  /**
   * Delete server from its source file
   */
  async deleteServer(
    serverName: ServerName,
  ): Promise<{ success: true } | { success: false; error: string }> {
    await this.#delay(500);

    const serverIndex = this.#servers.findIndex((s) => s.name === serverName);
    if (serverIndex === -1) {
      return { success: false, error: `Server "${serverName}" not found` };
    }

    // eslint-disable-next-line no-console
    console.log(`[MockMcpService] Deleting server "${serverName}"`);

    // Remove the server
    this.#servers.splice(serverIndex, 1);

    // Remove associated tools
    this.#tools = this.#tools.filter((t) => t.serverName !== serverName);

    this.#addLog(this.#generateLog(serverName, LogLevel.Info, `Server configuration deleted`));

    return { success: true };
  }

  /**
   * Save pre-approved tools configuration for a server
   */
  async saveApprovedTools(
    serverName: ServerName,
    approvedToolNames: string[],
  ): Promise<{ success: true } | { success: false; error: string }> {
    await this.#delay(300);

    // Update the server's config to reflect the new approvedTools list.
    // s.config is typed as `unknown` from CoreServerState, so cast to a record before spreading.
    this.#servers = this.#servers.map((s) => {
      if (s.name !== serverName) return s;
      return {
        ...s,
        config: {
          ...(s.config as Record<string, unknown>),
          approvedTools: approvedToolNames,
        },
      };
    });

    // Update isApproved on each tool for this server
    const updatedTools = this.#tools.map((t) => {
      if (t.serverName !== serverName) return t;
      return {
        ...t,
        isApproved: approvedToolNames.includes(t.originalToolName),
      };
    });
    this.#tools = updatedTools;

    // Emit tools:updated so the store reacts exactly as it would with the real backend
    const serverTools = this.#tools.filter((t) => t.serverName === serverName);
    this.#emit('tools:updated', serverName, serverTools);

    this.#addLog(
      this.#generateLog(serverName, LogLevel.Info, 'Tool approval configuration updated', {
        approvedTools: approvedToolNames.length,
        approvedToolNames,
      }),
    );

    return { success: true };
  }

  // ===== Server Approval Operations =====

  async approveServer(
    serverName: ServerName,
  ): Promise<{ success: true } | { success: false; error: string }> {
    await this.#delay(300);
    if (!this.#servers.some((s) => s.name === serverName)) {
      return { success: false, error: `Server not found: ${serverName}` };
    }
    this.#servers = this.#servers.map((s) => {
      if (s.name !== serverName) return s;
      const updated = { ...s, connectionState: ConnectionState.Connecting };
      this.#emit('server:state-changed', serverName, updated);
      return updated;
    });
    await this.#delay(500);
    this.#servers = this.#servers.map((s) => {
      if (s.name !== serverName) return s;
      const updated = { ...s, connectionState: ConnectionState.Connected, connectedAt: new Date() };
      this.#emit('server:connected', serverName, updated);
      return updated;
    });
    this.#addLog(this.#generateLog(serverName, LogLevel.Info, 'Server approved and started'));
    return { success: true };
  }

  async rejectServer(
    serverName: ServerName,
  ): Promise<{ success: true } | { success: false; error: string }> {
    await this.#delay(200);
    if (!this.#servers.some((s) => s.name === serverName)) {
      return { success: false, error: `Server not found: ${serverName}` };
    }
    this.#servers = this.#servers.map((s) => {
      if (s.name !== serverName) return s;
      const updated = { ...s, connectionState: ConnectionState.Rejected };
      this.#emit('server:state-changed', serverName, updated);
      return updated;
    });
    this.#addLog(this.#generateLog(serverName, LogLevel.Warning, 'Server rejected by user'));
    return { success: true };
  }

  async revokeServerDecision(
    serverName: ServerName,
  ): Promise<{ success: true } | { success: false; error: string }> {
    await this.#delay(200);
    if (!this.#servers.some((s) => s.name === serverName)) {
      return { success: false, error: `Server not found: ${serverName}` };
    }
    // Keep the server entry alive and put it back into PendingApproval, matching
    // the real backend behaviour (session is not disposed on revoke).
    this.#servers = this.#servers.map((s) => {
      if (s.name !== serverName) return s;
      const updated = { ...s, connectionState: ConnectionState.PendingApproval };
      this.#emit('server:state-changed', serverName, updated);
      return updated;
    });
    this.#addLog(this.#generateLog(serverName, LogLevel.Info, 'Server decision revoked'));
    return { success: true };
  }
}

/**
 * Singleton instance
 */
export const mockMcpService = new MockMcpService();
