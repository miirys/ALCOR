import { Injectable } from '@gitlab/needle';
import { z } from 'zod';
import { McpToolName } from '@gitlab-org/ai-configuration';
import { ToolInputDisplay } from '@gitlab-lsp/workflow-api';
import { ToolInputFormatContext, ToolInputFormatter } from './index';

// MCP tools forward their raw args verbatim; only the object shape is validated.
// Argument-less calls (no `args`) are allowed and default to an empty object.
const mcpToolArgsSchema = z.record(z.string(), z.unknown()).optional().default({});

/**
 * Formats MCP tool input. MCP tools use a namespaced name
 * (`mcp__<serverName>__<toolName>`), so this formatter matches by prefix via
 * {@link matches} rather than an exact `toolName`.
 */
@Injectable(ToolInputFormatter, [])
export class McpToolFormatter implements ToolInputFormatter {
  // Not used for exact lookup; MCP tools are resolved through `matches`.
  toolName = 'mcp_tool';

  matches(toolName: string): boolean {
    return McpToolName.is(toolName);
  }

  // Throws on invalid args; the dispatcher catches and falls back to generic.
  format(args: unknown, { toolName }: ToolInputFormatContext): ToolInputDisplay {
    const parsedArgs = mcpToolArgsSchema.parse(args);
    const { serverName, toolName: name } = McpToolName.parse(toolName as McpToolName);
    return { tool: 'mcp_tool', serverName, name, args: parsedArgs };
  }
}
