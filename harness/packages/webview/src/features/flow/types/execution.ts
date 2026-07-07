// Execution visualization types for the Flow Builder

/**
 * A parsed chat log message from the checkpoint
 */
export interface ChatLogMessage {
  type: 'tool' | 'agent';
  content: string;
  timestamp: Date;
  status: 'success' | 'failed' | 'pending';
  toolInfo?: {
    name: string;
    args: Record<string, unknown>;
  };
  subType?: string;
  componentName?: string;
}

/**
 * Statistics calculated from execution messages
 */
export interface ExecutionStats {
  totalMessages: number;
  toolCalls: number;
  agentResponses: number;
  startTime: Date | null;
  endTime: Date | null;
  durationMs: number | null;
}

/**
 * The complete execution trace built from checkpoint data
 */
export interface ExecutionTrace {
  status: 'idle' | 'running' | 'completed' | 'failed' | 'stopped';
  messages: ChatLogMessage[];
  stats: ExecutionStats;
  error: string | null;
  goal: string | null;
}

/**
 * A single node-lifecycle event from the backend, as received on a checkpoint.
 *
 * The backend emits an append-only log of these (one per node run transition);
 * `run_id` pairs a `started` with its terminal event and distinguishes
 * concurrent or repeated runs of the same component. `component` is the
 * design-time component the node belongs to, ready to join to canvas nodes via
 * `toComponentName(label)`.
 */
export type NodeEventPhase = 'started' | 'ended' | 'errored';

export interface NodeEvent {
  run_id: string;
  component: string;
  phase: NodeEventPhase;
}

// === Raw types from backend checkpoint ===

/**
 * Raw chat log entry as received from the backend
 */
export interface RawChatLogEntry {
  message_type: 'tool' | 'agent';
  content: string;
  timestamp: string;
  status: 'success' | 'failed';
  tool_info?: {
    name: string;
    args: Record<string, unknown>;
  };
  message_sub_type?: string;
  correlation_id?: string | null;
  additional_context?: unknown[];
  message_id?: string | null;
  component_name?: string | null;
}

/**
 * Raw checkpoint structure from the backend
 */
export interface RawCheckpoint {
  channel_values?: {
    ui_chat_log?: RawChatLogEntry[];
    status?: string;
    // Sent incrementally — each checkpoint carries only events appended since
    // the last one, so consumers must accumulate across checkpoints.
    node_events?: NodeEvent[];
  };
}
