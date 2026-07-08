import { Key } from 'ink';
import { CHAT_ELEMENT_TYPES, CLI_INPUT_TYPES, McpPanelView } from './constants';

/**
 * ConnectionState is intentionally duplicated from @gitlab-org/ai-configuration
 * to avoid coupling the TUI package to that backend domain package.
 * Both definitions must be kept in sync.
 */
export enum ConnectionState {
  Connecting = 'connecting',
  Authenticating = 'authenticating',
  Connected = 'connected',
  Disconnected = 'disconnected',
  Failed = 'failed',
  PendingApproval = 'pendingApproval',
  Rejected = 'rejected',
}

export interface Message {
  id: string;
  type: typeof CHAT_ELEMENT_TYPES.MESSAGE;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isComplete: boolean;
  agentMode?: AgentMode;
}

export interface ErrorMessage {
  id: string;
  type: typeof CHAT_ELEMENT_TYPES.ERROR;
  error: string;
  timestamp: number;
}

/**
 * ApprovalScope is intentionally duplicated from packages/cli/src/backend/backend.ts
 * to avoid coupling the TUI package to CLI backend. Both definitions must be kept in sync.
 */
export type ApprovalScope = 'session' | 'once';

// ToolInput is intentionally duplicated from @gitlab-lsp/workflow-api to avoid
// coupling the TUI package to workflow packages. Both definitions must be kept in sync.
interface FileWithContent {
  filepath: string;
  content: string;
}

interface TodoItem {
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

export type ToolInput =
  | { tool: 'read_file'; filepath: string; offset?: number; limit?: number }
  | { tool: 'read_files'; filepaths: string[] }
  | { tool: 'edit_file'; filepath: string; diff: { old: FileWithContent; new: FileWithContent } }
  | { tool: 'create_file_with_contents'; filepath: string; content: string }
  | { tool: 'run_command'; command: string }
  | { tool: 'shell_command'; command: string }
  | { tool: 'list_dir'; directory: string }
  | { tool: 'find_files'; pattern: string }
  | { tool: 'grep'; pattern: string; directory?: string; caseInsensitive?: boolean }
  | { tool: 'mkdir'; path: string }
  | { tool: 'run_git_command'; command: string; commandArgs?: string }
  | { tool: 'todo_write'; todos: TodoItem[] }
  | { tool: 'compaction'; trigger: string; wasCompacted: boolean }
  | { tool: 'mcp_tool'; name: string; serverName: string; args: Record<string, unknown> }
  | { tool: 'generic'; name: string; args: Record<string, unknown> };

export interface ToolCall {
  id: string;
  type: typeof CHAT_ELEMENT_TYPES.TOOL;
  name: string;
  input: ToolInput;
  state:
    | { type: 'loading' }
    | {
        type: 'approval_request';
        content: string;
        availableScopes: ApprovalScope[];
        suggestedPatterns?: string[];
      }
    | { type: 'success'; output: string }
    | { type: 'error'; error: string };
  timestamp: number;
}

export interface InfoMessage {
  id: string;
  type: typeof CHAT_ELEMENT_TYPES.INFO;
  message: string;
  timestamp: number;
}

export type ChatElement = Message | ToolCall | ErrorMessage | InfoMessage;

export interface ChoiceOption<T = string> {
  label: string;
  value: T;
  description?: string;
  /** Optional second line rendered below the label, dimmed and indented. Use for long
   * supplementary text (e.g. a glob pattern) that would wrap awkwardly inline. */
  secondaryLabel?: string;
}

export interface TextInputState {
  inputType: typeof CLI_INPUT_TYPES.TEXT;
  lines: string[];
  cursorLine: number;
  cursorColumn: number;
}

export interface ChoiceInputState {
  inputType: typeof CLI_INPUT_TYPES.CHOICE;
  choiceOptions: ChoiceOption<unknown>[];
  selectedChoiceIndex: number;
}

export interface HistorySearchInputState {
  inputType: typeof CLI_INPUT_TYPES.PROMPT_HISTORY_SEARCH;
  searchQuery: string;
  filteredHistory: { item: string; matches: number[] }[];
  selectedIndex: number;
}

export interface SessionListItem {
  id: string;
  title: string;
  status: string;
  lastActivity: string;
  lastMessagePreview?: string;
}

export interface SessionsSearchInputState {
  inputType: typeof CLI_INPUT_TYPES.SESSIONS_SEARCH;
  searchQuery: string;
  sessions: SessionListItem[];
  selectedIndex: number;
  isLoading: boolean;
  hasNextPage: boolean;
}

export interface ModelListItem {
  ref: string;
  name: string;
}

export interface ModelSelectionInputState {
  inputType: typeof CLI_INPUT_TYPES.MODEL_SELECTION;
  models: ModelListItem[];
  isLoading: boolean;
  currentModel: string;
}

export interface ToolRejectionReasonInputState {
  inputType: typeof CLI_INPUT_TYPES.TOOL_REJECTION_REASON;
  toolName: string;
}

export interface McpPanelServerItem {
  name: string;
  connectionState: ConnectionState;
  toolCount?: number;
  error?: string;
  authUrl?: string;
}

export interface McpPanelToolItem {
  name: string;
  description: string;
}

export interface McpPanelConfigFileItem {
  /** Display path, relative to cwd for workspace configs. Rendered in the panel. */
  path: string;
  /** Absolute path used for filesystem I/O (pre-seeding and opening the editor). */
  absolutePath: string;
  label: 'user' | 'project';
  exists: boolean;
}

export type McpPanelListItem =
  | { type: 'server'; server: McpPanelServerItem }
  | { type: 'config_file'; configFile: McpPanelConfigFileItem };

export interface McpPanelServerListView {
  view: typeof McpPanelView.ServerList;
  configFiles: McpPanelConfigFileItem[];
  errorMessage?: string;
}

export interface McpPanelServerDetailView {
  view: typeof McpPanelView.ServerDetail;
  server: McpPanelServerItem;
  tools: McpPanelToolItem[];
  serverVersion?: string;
  configSource?: string;
}

export interface McpPanelInputState {
  inputType: typeof CLI_INPUT_TYPES.MCP_PANEL;
  servers: McpPanelServerItem[];
  selectedIndex: number;
  panelView: McpPanelServerListView | McpPanelServerDetailView;
}

/** A single server row in the startup MCP approval prompt. */
export interface McpApprovalServerItem {
  /** Server name as it appears in mcp.json */
  name: string;
  /** Current pending decision for this row */
  decision: 'approve' | 'reject';
}

export interface McpApprovalInputState {
  inputType: typeof CLI_INPUT_TYPES.MCP_APPROVAL;
  servers: McpApprovalServerItem[];
  /** Absolute path to the storage file, rendered in the inline hint. */
  storagePath: string;
}

export type InputState =
  | TextInputState
  | ChoiceInputState
  | HistorySearchInputState
  | SessionsSearchInputState
  | HelpDialogInputState
  | DiagnosticsDialogInputState
  | ModelSelectionInputState
  | ToolRejectionReasonInputState
  | FeedbackInputState
  | LogPreviewDialogInputState
  | SettingsInputState
  | McpPanelInputState
  | SkillsDialogInputState
  | AgentsDialogInputState
  | McpApprovalInputState
  | PoolPanelInputState;

export interface KeyModifiers extends Key {
  home: boolean;
  end: boolean;
}

export interface SlashCommand {
  name: string;
  description: string;
}

export interface HelpDialogInputState {
  inputType: typeof CLI_INPUT_TYPES.HELP_DIALOG;
  slashCommands?: SlashCommand[];
}

export interface SkillsDialogInputState {
  inputType: typeof CLI_INPUT_TYPES.SKILLS_DIALOG;
  skills: SlashCommand[];
}

export interface AgentsDialogInputState {
  inputType: typeof CLI_INPUT_TYPES.AGENTS_DIALOG;
  agents: SlashCommand[];
}

export interface DiagnosticsDialogInputState {
  inputType: typeof CLI_INPUT_TYPES.DIAGNOSTICS_DIALOG;
  content: string;
}

export interface LogPreviewDialogInputState {
  inputType: typeof CLI_INPUT_TYPES.LOG_PREVIEW_DIALOG;
  logContent: string;
  logFilePath: string;
}

export interface SettingsOption {
  value: string;
  label: string;
}

interface SettingsItemBase {
  key: string;
  label: string;
  description: string;
}

/** A boolean on/off setting. */
export interface SettingsToggleItem extends SettingsItemBase {
  enabled: boolean;
  options?: never;
  value?: never;
}

/** A single-value setting chosen from a fixed list of options. */
export interface SettingsSelectorItem extends SettingsItemBase {
  /** The selectable options; its presence is what distinguishes a selector from a toggle. */
  options: SettingsOption[];
  /** The currently selected option value. */
  value: string;
  enabled?: never;
}

export type SettingsItem = SettingsToggleItem | SettingsSelectorItem;

/** Live session facts the Stats tab renders; gathered when settings opens. */
export interface SettingsStats {
  turns: number;
  toolCounts: { name: string; count: number }[];
  tokensUsed?: number;
  tokensMax?: number;
  model?: string;
  sessions?: number;
}

export interface SettingsInputState {
  inputType: typeof CLI_INPUT_TYPES.SETTINGS;
  items: SettingsItem[];
  selectedIndex: number;
  /** Optional payload for the Stats tab (ALCOR settings). */
  stats?: SettingsStats;
  /** Optional MCP snapshot for the MCP tab (ALCOR settings). */
  mcpServers?: McpPanelServerItem[];
  /** Tab to open on (e.g. /theme → Appearance, /stats → Stats). */
  initialTab?: 'Appearance' | 'Behavior' | 'Stats' | 'MCP' | 'Keys';
}

/** One credit group in the pool bridge status panel. */
export interface PoolPanelGroup {
  id: string;
  active: boolean;
  creditsUsed: number;
  creditsCap: number;
  ready: boolean;
  exhausted: boolean;
}

export interface PoolPanelInputState {
  inputType: typeof CLI_INPUT_TYPES.POOL_PANEL;
  running: boolean;
  logUrl?: string;
  thresholdCredits?: number;
  creditsCap?: number;
  groups: PoolPanelGroup[];
}

export interface FeedbackInputState {
  inputType: typeof CLI_INPUT_TYPES.FEEDBACK;
  step: 'type-selection' | 'description' | 'title' | 'log-confirmation' | 'submitting' | 'success';
  selectedType?: 'bug' | 'feature';
  includeLogs?: boolean;
  issueUrl?: string;
  issueNumber?: number;
  error?: string;
  submissionMethod?: 'api' | 'url';
  isGitLabDotCom?: boolean;
  showLogPreview?: boolean;
  logPreviewContent?: string;
  logPreviewPath?: string;
}

export interface AppCallbacks {
  onCancelStream: () => void;
  onForceStop: () => void;
  onSubmit: (value: string) => Promise<void>;
  onChoiceSubmit: (value: unknown) => void;
  onExit: () => void;
  toggleExpanded: () => void;
  onTextChange: (text: string) => Promise<void>;
  onHistoryPrevious: (currentText: string) => void;
  onHistoryNext: (currentText: string) => void;
  onOpenHistorySearch: () => void;
  onCancelHistorySearch: () => void;
  onHistorySearchQueryChange: (query: string) => void;
  onSelectHistoryItem: (item: string) => void;
  onDeleteHistoryItem: (item: string) => Promise<void>;
  onCycleAgent: () => void;
  /** Clears the queued prompt (Esc) without exiting or cancelling the stream. */
  onCancelQueuedPrompt: () => void;
  onSubmitRejectionReason: (reason: string) => void;
  onCancelRejectionReason: () => void;
  /** Called when the terminal gains or loses focus (DEC mode ?1004). */
  onFocusChange?: (focused: boolean) => void;
}

export interface GitLabRemoteConnected {
  status: 'connected';
  gitlabPath: string;
  gitlabHost: string;
}

export interface GitLabRemoteError {
  status: 'error';
  errorMessage: string;
}
export interface GitLabRemoteNotChecked {
  status: 'not-checked';
}

export type GitLabRemoteInfo = GitLabRemoteConnected | GitLabRemoteError | GitLabRemoteNotChecked;

export type UpdateCheckResult =
  | { type: 'needs-update'; updateInfo: UpdateInfo }
  | { type: 'up-to-date'; updateInfo: UpdateInfo }
  | { type: 'error'; error: Error };

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  installCommand: string;
}

export type AgentMode = 'build' | 'plan';

/**
 * Tool-approval permission mode. In 'auto' mode tool calls are approved
 * automatically for the session (like auto-accept in other agent CLIs);
 * 'default' prompts the user for every approval request.
 */
export type PermissionMode = 'default' | 'auto';

export interface AgenticChatAccessStatus {
  status: 'checking' | 'available' | 'unavailable';
  sessionCreated: boolean;
  reason?: string;
}

export interface RetryStatus {
  attempt: number;
  maxAttempts: number;
  backoffMs: number;
  startedAt: number;
}

export interface ContextUsage {
  totalTokens: number;
  maxTokens: number;
}

export interface AppState {
  sessionId?: string;
  elements: ChatElement[];
  input: InputState;
  isLoading: boolean;
  expanded: boolean;
  cwd: string;
  username?: string;
  credentialSource?: string;
  gitlabRemoteInfo: GitLabRemoteInfo;
  updateCheckResult?: UpdateCheckResult;
  agenticChatAccess?: AgenticChatAccessStatus;
  mcpServers?: McpPanelServerItem[];
  selectedModel: string;
  availableAgents: AgentMode[];
  selectedAgent: AgentMode;
  /** Current tool-approval mode; when 'auto', pending tool calls are approved without prompting. */
  permissionMode?: PermissionMode;
  retryStatus?: RetryStatus;
  contextUsage?: ContextUsage;
  /**
   * A prompt submitted mid-turn, held until the next turn boundary. Agent mode
   * is captured at queue time so cycling agents before flush does not silently
   * change the request.
   */
  queuedPrompt?: {
    prompt: string;
    agentMode: AgentMode;
  };
}
