import { createInterfaceId } from '@gitlab/needle';

export interface StdioLaunchParams {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpStdioCommandTransformer<TOverrides = unknown> {
  /**
   * Apply launch-time policy (e.g. sandbox wrapping) to STDIO MCP server launch params.
   * Return params unchanged if no transformation is needed.
   *
   * `overrides` is an opaque per-server config blob defined by the active implementation.
   * ai-configuration extracts it from `StdioServerConfig.sandbox` via the existing zod
   * schema and forwards it untyped here; the impl casts to its expected shape.
   */
  transform(
    serverName: string,
    params: StdioLaunchParams,
    workspacePath: string,
    overrides?: TOverrides,
  ): Promise<StdioLaunchParams>;
}

export const McpStdioCommandTransformer = createInterfaceId<McpStdioCommandTransformer>(
  'McpStdioCommandTransformer',
);
