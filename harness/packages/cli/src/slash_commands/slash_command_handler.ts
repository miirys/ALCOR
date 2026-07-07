import React from 'react';
import { createInterfaceId } from '@gitlab/needle';
import type { ControllerApi } from '../commands/tui/controller_api';

export enum SlashCommandAction {
  NewSession = 'new_session',
  Sessions = 'sessions',
  Help = 'help',
  Model = 'model',
  Copy = 'copy',
  Feedback = 'feedback',
  Skills = 'skills',
  Compact = 'compact',
  Exit = 'exit',
  Settings = 'settings',
  Mcp = 'mcp',
  Auto = 'auto',
  // Registry-only: the MCP approval handler is `internal` with a no-op execute(),
  // so this action is never dispatched. It exists to key the component registry entry.
  McpApproval = 'mcp_approval',
}

export interface SlashCommand {
  name: string;
  description: string;
  action: string;
  /**
   * Internal commands are registered only to contribute a component to the
   * CommandComponentRegistry. They are hidden from the command list and
   * autocomplete (not user-invokable).
   */
  internal?: boolean;
  /** Alternative names; each is independently executable (e.g. ['/quit'] for /exit). */
  aliases?: readonly string[];
}

export interface CommandComponentEntry<C> {
  inputType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.ComponentType<{ input: any; callbacks: C }>;
  callbacks: C;
  /**
   * Optional resolver returning the status bar footer hint for this component's
   * input state (or `null` for the default mode switcher). Defined next to the
   * component in the TUI package and forwarded into the component registry.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  footerHint?: (input: any) => string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SlashCommandHandler<C = any> {
  command: SlashCommand;

  execute(api: ControllerApi, args?: string[]): Promise<void>;

  /**
   * Optional: return the React component and callbacks to register for this
   * command's inputType. When the TUI's input transitions to this inputType,
   * MessageInput will render this component with these callbacks.
   *
   * Implement this on handlers that open a dialog component driven by a
   * dedicated inputType (e.g. SESSIONS_SEARCH, HELP_DIALOG, MODEL_SELECTION).
   */
  getComponent?(api: ControllerApi): CommandComponentEntry<C>;
}

export const SlashCommandHandler = createInterfaceId<SlashCommandHandler>('SlashCommandHandler');
