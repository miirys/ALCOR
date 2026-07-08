export const CLI_INPUT_TYPES = {
  TEXT: 'text',
  CHOICE: 'choice',
  PROMPT_HISTORY_SEARCH: 'history_search',
  SESSIONS_SEARCH: 'sessions_search',
  HELP_DIALOG: 'help_dialog',
  DIAGNOSTICS_DIALOG: 'diagnostics_dialog',
  MODEL_SELECTION: 'model_selection',
  TOOL_REJECTION_REASON: 'tool_rejection_reason',
  FEEDBACK: 'feedback',
  LOG_PREVIEW_DIALOG: 'log_preview_dialog',
  SETTINGS: 'settings',
  MCP_PANEL: 'mcp_panel',
  SKILLS_DIALOG: 'skills_dialog',
  AGENTS_DIALOG: 'agents_dialog',
  MCP_APPROVAL: 'mcp_approval',
  POOL_PANEL: 'pool_panel',
  PROVIDER_WIZARD: 'provider_wizard',
} as const;

export const CHAT_ELEMENT_TYPES = {
  MESSAGE: 'message',
  TOOL: 'tool',
  ERROR: 'error',
  INFO: 'info',
} as const;

export const McpPanelView = {
  ServerList: 'server_list',
  ServerDetail: 'server_detail',
} as const;

// Rows consumed by chrome elements: marginTop(1) + loadingIndicator(1) + input(~4) + statusBar(1) + margins(2)
export const CHROME_ROWS = 9;

// Fallback terminal width when `process.stdout.columns` is unavailable or a
// component is rendered in isolation (e.g. a unit test). Components rendered
// inside Ink's `<Static>` must receive the real width as a prop because
// `useStdout` is unreliable there during live→static transitions; this
// constant is only the fallback path.
export const DEFAULT_TERMINAL_WIDTH = 80;

// Guards the first-time onboarding card. Kept `false` so the in-progress card
// is not shown to users while its steps and behavior are still being finalized
// — this lets the work merge without releasing the feature. Tests that need the
// card render it directly, or override this flag (e.g. via `jest.mock`).
export const ONBOARDING_CARD_ENABLED = false;
