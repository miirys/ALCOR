/**
 * CC-compatible hook types.
 * Only SessionStart-relevant types are actively used; other event keys
 * are kept in the config schema for forward compatibility.
 */

// --- Configuration types ---

export interface HooksConfig {
  hooks?: {
    SessionStart?: MatcherGroup[];
    // TODO
    // UserPromptSubmit?: MatcherGroup[];
    // PreToolUse?: MatcherGroup[];
    // PostToolUse?: MatcherGroup[];
    // Stop?: MatcherGroup[];
  };
}

export interface MatcherGroup {
  /** Regex tested against source (SessionStart) or tool_name (Pre/PostToolUse). Omit or "" to match all. */
  matcher?: string;
  hooks: CommandHook[];
}

export interface CommandHook {
  type: 'command';
  /** Shell command string executed via /bin/sh -c. */
  command: string;
  /** Timeout in seconds. Default: 30. */
  timeout?: number;
}

// --- Event input types (stdin JSON) ---

interface CommonInput {
  session_id: string;
  cwd: string;
  transcript_path?: string;
  hook_event_name: 'SessionStart';
}

export interface SessionStartInput extends CommonInput {
  hook_event_name: 'SessionStart';
  source: 'startup' | 'resume'; // | 'clear' | 'compact';
  model?: string;
  agent_type?: string;
}

// --- Event output types (stdout JSON) ---

export interface SessionStartOutput {
  hookSpecificOutput?: {
    hookEventName: 'SessionStart';
    additionalContext?: string;
  };
}

// --- Execution result types ---

export interface HookResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  parsedOutput: Record<string, unknown> | null;
  timedOut: boolean;
}

export interface AggregatedSessionStartResult {
  additionalContext?: string;
}
