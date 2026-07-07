import {
  CreateWebviewMessages,
  WebviewConnection,
  WebviewInstanceId,
} from '@gitlab-org/webview-plugin';
import { FeatureFlagService, UserService, GitLabApiService } from '@gitlab-org/core';
import { WorkflowRunner, UsageQuotaService } from '@gitlab-lsp/workflow-api';
import { AgentPlatformProjectService } from '@gitlab-lsp/workflow-api/node';
import { MessageBus } from '@gitlab-org/message-bus';
import { createFakePartial } from '@gitlab-org/test-utils';
import { ChatContextManager, SystemContextManager } from '@gitlab-org/ai-context';
import { AgentSkillsResolver } from '@gitlab-org/ai-context/node';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import {
  McpManagerWorkflowExecutorAdaptor,
  McpToolApprovalController,
} from '@gitlab-org/ai-configuration';
import { Connection } from 'vscode-languageserver';
import { DuoAgentPlatformTracker, DuoChatSnowplowTracker } from '@gitlab-org/telemetry';
import { UserPersistentStorage } from '@gitlab-org/persistent-storage';
import { DuoWorkflowMessages } from '../contract';

export type WebviewMessageMap = CreateWebviewMessages<{
  fromWebview: DuoWorkflowMessages['webviewToPlugin'];
  toWebview: DuoWorkflowMessages['pluginToWebview'];
}>;
export type ExtensionMessageMap = {
  inbound: DuoWorkflowMessages['extensionToPlugin'];
  outbound: DuoWorkflowMessages['pluginToExtension'];
};

const workflowController = {
  startWorkflow: jest.fn(),
  getWorkflowById: jest.fn(),
  sendWorkflowEvent: jest.fn(),
  stopSubscriptions: jest.fn(),
  getWorkflowCapabilities: jest.fn().mockReturnValue(null),
};
const workflowCommonController = {
  checkHealth: jest.fn(),
  getGraphqlData: jest.fn(),
  getProjectPath: jest.fn(),
  pullDockerImage: jest.fn(),
  verifyDockerImage: jest.fn(),
};
const workflowConnectionController = {
  openUrl: jest.fn(),
  copyCodeSnippet: jest.fn(),
  insertCodeSnippet: jest.fn(),
  copyMessage: jest.fn(),
  copyText: jest.fn(),
};

const aiContextController = {
  addContextItem: jest.fn(),
  removeContextItem: jest.fn(),
  clearContextItems: jest.fn(),
  searchContextItems: jest.fn(),
  getContextCategories: jest.fn(),
};

const userServiceController = {
  getUserInfo: jest.fn(),
};

const repositoriesController = {
  getRepositories: jest.fn(),
  selectProjectForWorkflow: jest.fn(),
};

const modelSelectionController = {
  persistSelectedModel: jest.fn(),
  getPersistedSelectedModel: jest.fn(),
};

const telemetryController = {
  trackFeedback: jest.fn(),
};

const webviewInstanceId = 'someInstanceId' as WebviewInstanceId;

const workflowApi = {
  subscribeToWorkflow: jest.fn(),
  unsubscribeFromWorkflow: jest.fn(),
  disconnectCable: jest.fn(),
  getServerCapabilities: jest.fn().mockReturnValue(null),
} as unknown as jest.Mocked<WorkflowRunner>;

const connection = {} as jest.Mocked<Connection>;

const webview = {
  broadcast: jest.fn(),
  onInstanceConnected: jest.fn(),
} as jest.Mocked<WebviewConnection<WebviewMessageMap>>;

const extension = {
  onNotification: jest.fn(),
  sendNotification: jest.fn(),
} as unknown as jest.Mocked<MessageBus<ExtensionMessageMap>>;

const messageBus = {
  sendNotification: jest.fn(),
  onNotification: jest.fn(),
} as unknown as jest.Mocked<
  MessageBus<{
    inbound: WebviewMessageMap['fromWebview'];
    outbound: WebviewMessageMap['toWebview'];
  }>
>;

const chatContextManager = createFakePartial<ChatContextManager>({
  addSelectedContextItem: jest.fn(),
  removeSelectedContextItem: jest.fn(),
  clearSelectedContextItems: jest.fn(),
  searchContextItems: jest.fn(),
  getAvailableCategories: jest.fn(),
  getSelectedContextItems: jest.fn(),
});

const systemContextManager = createFakePartial<SystemContextManager>({
  getSystemContextItems: jest.fn(),
});

const duoChatTracker = createFakePartial<DuoChatSnowplowTracker>({
  trackEvent: jest.fn(),
});

const featureFlagService = createFakePartial<FeatureFlagService>({
  isClientFlagEnabled: jest.fn(),
  isInstanceFlagEnabled: jest.fn().mockReturnValue(false),
  onChanged: jest.fn(),
});

const mockUserService = createFakePartial<UserService>({
  user: {
    id: 'gid://gitlab/1/user-123',
    username: 'testuser',
    name: 'Test User',
    avatarUrl: 'https://example.com/avatar.png',
    restId: 123,
  },
});

const secretRedactor = createFakePartial<SecretRedactor>({
  redactSecrets: jest.fn().mockImplementation((input: string) => input),
});

const mcpToolApprovalController = createFakePartial<McpToolApprovalController>({
  approveToolForSession: jest.fn().mockResolvedValue(undefined),
});

const gitlabApiService = createFakePartial<GitLabApiService>({
  instanceInfo: {
    instanceVersion: '18.3.0',
  },
  onApiReconfigured: jest.fn(),
});

const duoAgentPlatformTracker = createFakePartial<DuoAgentPlatformTracker>({
  trackEvent: jest.fn().mockResolvedValue(undefined),
  isEnabled: jest.fn().mockReturnValue(true),
});

const agentPlatformProjectService = createFakePartial<AgentPlatformProjectService>({
  getRepositories: jest.fn(),
  getSelectedProject: jest.fn(),
  setSelectedProject: jest.fn(),
  getProjectData: jest.fn(),
});

const usageQuotaService = createFakePartial<UsageQuotaService>({
  checkUsageCreditsExceeded: jest.fn().mockResolvedValue(false),
});

const userPersistentStorage = createFakePartial<UserPersistentStorage>({
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
});

const agentSkillsResolver = createFakePartial<AgentSkillsResolver>({
  resolveAgentSkillsContextItem: jest.fn().mockResolvedValue({
    category: 'user_rule' as const,
    content: 'No agent skills were discovered (no skill locations were configured).',
    id: 'agent-skills-instructions',
    metadata: {
      title: 'Agent Skills',
      enabled: true,
      subType: 'user_rule' as const,
      icon: 'document',
      secondaryText: '',
      subTypeLabel: 'No agent skills found',
    },
  }),
  getSkillSlashCommands: jest.fn().mockResolvedValue({ commands: [], warnings: [] }),
});

const mcpManager = createFakePartial<McpManagerWorkflowExecutorAdaptor>({
  preWarm: jest.fn(),
});

export default {
  workflowApi,
  connection,
  webview,
  extension,
  messageBus,
  chatContextManager,
  systemContextManager,
  secretRedactor,
  mcpToolApprovalController,
  duoChatTracker,
  mockUserService,
  workflowController,
  workflowCommonController,
  workflowConnectionController,
  aiContextController,
  telemetryController,
  webviewInstanceId,
  featureFlagService,
  userServiceController,
  repositoriesController,
  modelSelectionController,
  gitlabApiService,
  duoAgentPlatformTracker,
  agentPlatformProjectService,
  usageQuotaService,
  userPersistentStorage,
  agentSkillsResolver,
  mcpManager,
};
