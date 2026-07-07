import type {
  ChatLogMessage,
  ExecutionTrace,
  ExecutionStats,
  RawCheckpoint,
  RawChatLogEntry,
} from '../types/execution';

/**
 * Parse a raw checkpoint JSON string into structured messages
 */
function parseCheckpoint(checkpointStr: string): {
  messages: ChatLogMessage[];
  status: string | null;
} {
  try {
    const checkpoint: RawCheckpoint = JSON.parse(checkpointStr);
    const rawMessages = checkpoint.channel_values?.ui_chat_log ?? [];
    const status = checkpoint.channel_values?.status ?? null;

    const messages = rawMessages.map(parseRawChatLogEntry);

    return { messages, status };
  } catch (error) {
    return { messages: [], status: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Parse a single raw chat log entry into a ChatLogMessage
 */
function parseRawChatLogEntry(raw: RawChatLogEntry): ChatLogMessage {
  return {
    type: raw.message_type,
    content: raw.content,
    timestamp: new Date(raw.timestamp),
    status: raw.status ?? 'pending',
    toolInfo: raw.tool_info
      ? {
          name: raw.tool_info.name,
          args: raw.tool_info.args,
        }
      : undefined,
    subType: raw.message_sub_type,
    componentName: raw.component_name ?? undefined,
  };
}

/**
 * Calculate execution statistics from messages
 */
function calculateStats(
  messages: ChatLogMessage[],
  status: 'idle' | 'running' | 'completed' | 'failed' | 'stopped',
): ExecutionStats {
  const toolCalls = messages.filter((m) => m.type === 'tool').length;
  const agentResponses = messages.filter((m) => m.type === 'agent').length;

  const timestamps = messages.map((m) => m.timestamp.getTime()).filter((t) => !Number.isNaN(t));

  const startTime = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null;
  const endTime =
    status !== 'running' && timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;

  const durationMs = startTime && endTime ? endTime.getTime() - startTime.getTime() : null;

  return {
    totalMessages: messages.length,
    toolCalls,
    agentResponses,
    startTime,
    endTime,
    durationMs,
  };
}

/**
 * Build a complete execution trace from store state
 */
export function buildExecutionTrace(
  events: { checkpoint: string; workflowStatus: string; errors: string[] }[],
  status: 'idle' | 'running' | 'completed' | 'failed' | 'stopped',
  goal: string | null,
  error: string | null,
): ExecutionTrace {
  // Get the latest checkpoint (last event has most complete data)
  const latestEvent = events[events.length - 1];

  if (!latestEvent) {
    return {
      status,
      messages: [],
      stats: calculateStats([], status),
      error,
      goal,
    };
  }

  const { messages } = parseCheckpoint(latestEvent.checkpoint);

  return {
    status,
    messages,
    stats: calculateStats(messages, status),
    error,
    goal,
  };
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
