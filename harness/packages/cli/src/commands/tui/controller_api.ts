import type { AppState, SlashCommand } from '@gitlab-org/tui';
import { SendPromptAction, ToolApprovalAction } from '../../backend/backend';

export type StateMutation = (oldState: AppState) => AppState;

/**
 * API provided to handlers for interacting with the TUI Controller.
 */
export interface ControllerApi {
  /**
   * Mutate application state using a transformation function.
   * The mutation receives the current state and returns the new state.
   */
  mutateState(mutation: StateMutation): AppState;

  /**
   * Display an error message to the user.
   * The error will appear in the chat as an error element.
   */
  showError(message: string): void;

  /**
   * Display an informational message to the user.
   * The message will appear in the chat as an info element.
   */
  showInfo(message: string): void;

  /**
   * Send a prompt to the backend.
   * This allows commands to trigger AI interactions programmatically.
   */
  sendPrompt(prompt: SendPromptAction): Promise<void>;

  /**
   * Wait for lazy initialization to complete before performing an action.
   */
  ensureInitialized(): Promise<void>;

  /**
   * Get the list of all registered slash commands.
   * Used by commands like /help to display available commands.
   */
  getCommands(): SlashCommand[];

  /**
   * Send a tool approval or rejection to the backend.
   */
  sendToolApproval(action: ToolApprovalAction): void;

  /**
   * Initiate a graceful shutdown of the application.
   */
  exit(): void;
}
