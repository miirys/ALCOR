import { v4 } from 'uuid';
import { toolApprovalTypes } from '../constants.ts';

export const createUserMessage = (message, contextItems, approvalOptions) => {
  const messageObj = {
    content: message,
    message_type: 'user',
    role: 'user',
    timestamp: new Date(),
    correlation_id: v4(),
    extras: {
      contextItems,
    },
  };

  if (approvalOptions) {
    messageObj.approvalOptions = approvalOptions;
  }

  return messageObj;
};

export const createErrorMessage = (error) => {
  return {
    content: '',
    message_type: 'agent',
    role: 'agent',
    timestamp: new Date(),
    correlation_id: v4(),
    errors: [error],
  };
};

export const getApprovalOptions = (
  message,
  supportsSessionApprovals,
  supportsPatternApprovals = false,
) => {
  if (message.message_type !== 'request' || !message.tool_info) return [];

  const baseApprovalOption = {
    type: toolApprovalTypes.APPROVE_TOOL_ONCE,
    text: 'Approve',
    primary: true,
  };

  const isMcpTool = message.tool_info.name?.startsWith('mcp__');

  // Show "Approve for Session" if:
  // 1. Gateway supports it (tool_call_approval capability present)
  //    - supportsSessionApprovals is calculated by supportsToolCallApprovals() in the plugin
  // 2. Gateway doesn't support it AND tool is MCP (backwards compatibility)
  const mcpLegacySupport = !supportsSessionApprovals && isMcpTool;

  const sessionApprovalEnabled = supportsSessionApprovals || mcpLegacySupport;
  const sessionApprovalOption = {
    type: toolApprovalTypes.APPROVE_FOR_SESSION,
    text: 'Approve for Session',
  };

  if (!sessionApprovalEnabled) {
    sessionApprovalOption.disabled = true;
    sessionApprovalOption.secondaryText = 'Disabled. Contact your administrator.';
  }

  const options = [baseApprovalOption, sessionApprovalOption];

  // Add pattern-based approval options if the backend provided suggested patterns
  // and the gateway advertises the tool_call_pattern_approval capability.
  // Pattern approval is an extension of session approval — both must be enabled.
  const suggestedPatterns = message.tool_info.suggested_patterns;
  if (sessionApprovalEnabled && supportsPatternApprovals && suggestedPatterns?.length) {
    for (const pattern of suggestedPatterns) {
      options.push({
        type: toolApprovalTypes.APPROVE_PATTERN_FOR_SESSION,
        text: `Approve ${pattern} for session`,
        pattern,
      });
    }
  }

  return options;
};

export const mapChatMessage = (
  message,
  supportsSessionApprovals,
  supportsPatternApprovals = false,
) => {
  const mappedMessage = {
    ...message,
    role: message.message_type,
  };

  // Only add extras if user message has additionalContext
  if (message.message_type === 'user' && message.additional_context) {
    mappedMessage.extras = { contextItems: message.additional_context };
  }

  // Compute approval options if not already set (may be set by backend in future)
  if (!message.approvalOptions) {
    mappedMessage.approvalOptions = getApprovalOptions(
      message,
      supportsSessionApprovals,
      supportsPatternApprovals,
    );
  }

  return mappedMessage;
};

export const createToolApprovalMessage = (content, toolName, approvalOptions) => {
  const messageObj = {
    content,
    message_type: 'agent',
    role: 'agent',
    timestamp: new Date(),
    correlation_id: v4(),
    toolName,
  };

  if (approvalOptions) {
    messageObj.approvalOptions = approvalOptions;
  }

  return messageObj;
};

export const randomizeArrayToNItems = (array, n) => {
  const prompts = [...array];
  const max = Math.min(n, prompts.length);

  for (let i = 0; i < max; i += 1) {
    const j = i + Math.floor(Math.random() * (prompts.length - i));
    [prompts[i], prompts[j]] = [prompts[j], prompts[i]];
  }

  return prompts.slice(0, max);
};

/**
 * Simple hash function for message content
 * Used to detect if a message has changed without deep comparison
 */
/* eslint-disable no-bitwise */
export const hashMessage = (msg) => {
  const str = JSON.stringify({
    content: msg.content,
    role: msg.role,
    message_type: msg.message_type,
    timestamp: msg.timestamp,
    chunkId: msg.chunkId,
    status: msg.status,
  });
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash &= hash; // Convert to 32bit integer
  }
  return hash.toString(36);
};
/* eslint-enable no-bitwise */
