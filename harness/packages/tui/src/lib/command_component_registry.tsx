import React, { createContext, useContext } from 'react';

/**
 * A registered command component entry. Maps an inputType to the React component
 * that should render for it, along with the callbacks that component needs.
 *
 * Typed loosely here so that the registry is agnostic to any specific command.
 * Each command handler provides its own narrowly-typed component and callbacks;
 * the types are enforced at the registration site in packages/cli.
 */
export interface RegisteredCommandComponent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.ComponentType<{ input: any; callbacks: any }>;
  callbacks: Record<string, (...args: unknown[]) => unknown>;
  /**
   * Optional resolver returning the status bar footer hint for this component's
   * input state, or `null` to show the default mode switcher. Co-located with
   * the component and forwarded from the command handler's `getComponent`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  footerHint?: (input: any) => string | null;
}

/**
 * A map from inputType string to its registered component + callbacks.
 * Built by SlashCommandService and provided to the TUI via App props.
 */
export type CommandComponentRegistry = Map<string, RegisteredCommandComponent>;

const CommandComponentRegistryContext = createContext<CommandComponentRegistry>(new Map());

export const CommandComponentRegistryProvider = CommandComponentRegistryContext.Provider;

export const useCommandComponentRegistry = (): CommandComponentRegistry =>
  useContext(CommandComponentRegistryContext);
