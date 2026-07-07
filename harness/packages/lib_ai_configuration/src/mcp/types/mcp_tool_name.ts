import { err, Result } from 'neverthrow';
import { ServerName } from './mcp';

/**
 * ⚠️ WARNING: If MCP_TOOL_DELIMITER changes, you must also change the MCP_PATTERN
 */
export const MCP_TOOL_DELIMITER = '__';
/**
 * ⚠️ WARNING: If MCP_PREFIX changes, you must also change the MCP_PATTERN
 */
const MCP_PREFIX = 'mcp';
const MCP_PATTERN = /^mcp__(.*?)__(.*)$/;

export type McpToolAddress = {
  serverName: ServerName;
  toolName: string;
};

export type McpToolName = string & { __brand: 'McpToolName' };
export const McpToolName = {
  /** Create canonical tool name from its address */
  create: (address: McpToolAddress): McpToolName => {
    return [MCP_PREFIX, address.serverName, address.toolName].join(
      MCP_TOOL_DELIMITER,
    ) as McpToolName;
  },

  /** Parse canonical tool name back into its address */
  parse(input: string): McpToolAddress {
    return parse(input).match(
      (address) => address,
      (error) => {
        throw error;
      },
    );
  },

  /** Type guard for strings that look like a canonical tool name */
  is(value: string): value is McpToolName {
    return parse(value).isOk();
  },
};

function parse(input: string): Result<McpToolAddress, Error> {
  const match = input.match(MCP_PATTERN);

  if (!match) {
    const EXAMPLE = McpToolName.create({
      serverName: 'serverName' as ServerName,
      toolName: 'toolName',
    });
    return err(new Error(`Invalid MCP tool name: "${input}". Expected format: ${EXAMPLE}`));
  }

  const [, rawServerName, toolName] = match;

  if (!rawServerName || !toolName) {
    return err(new Error(`Invalid MCP tool name: "${input}". Server name or tool name is empty.`));
  }

  const serverNameResult = Result.fromThrowable(
    () => ServerName.parse(rawServerName),
    (error) => new Error(`Invalid server name "${rawServerName}" in MCP tool name: ${error}`),
  )();

  return serverNameResult.map((serverName) => ({ serverName, toolName }));
}
