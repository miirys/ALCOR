import { z } from 'zod';
import { ServerName } from '../types';

const NonEmptyString = z.string().min(1);
export type FilePath = string & { readonly __brand: 'FilePath' };

const Url = z.union([z.url().transform((x) => new URL(x)), z.instanceof(URL)]);

const OAuth2Config = z.object({
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  scopes: z.array(z.string()).optional(),
});

const BaseServerConfig = z
  .looseObject({
    approvedTools: z.union([z.array(z.string()), z.boolean()]).optional(),
  })
  .meta({ description: 'Common MCP server fields' });

// Fields align with McpServerSandboxOverrides from @gitlab-org/sandbox.
// `allowRead` is intentionally omitted — srt does not support read allowlisting.
const McpSandboxOverrides = z
  .object({
    sandboxEnabled: z.boolean().optional(),
    allowedDomains: z.array(z.string()).optional(),
    allowWrite: z.array(z.string()).optional(),
    denyRead: z.array(z.string()).optional(),
  })
  .meta({ description: 'Per-server sandbox overrides for sandbox provider' });

type McpSandboxOverrides = z.infer<typeof McpSandboxOverrides>;

export const StdioServerConfig = BaseServerConfig.extend({
  type: z.literal('stdio'),
  command: NonEmptyString,
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  sandbox: McpSandboxOverrides.optional(),
});
export type StdioServerConfig = z.infer<typeof StdioServerConfig>;

export const SseServerConfig = BaseServerConfig.extend({
  type: z.literal('sse'),
  url: Url,
  headers: z.record(z.string(), z.string()).optional(),
  oauth2: OAuth2Config.optional(),
});
export type SseServerConfig = z.infer<typeof SseServerConfig>;

export const StreamableHttpServerConfig = BaseServerConfig.extend({
  type: z.literal('http'),
  url: Url,
  headers: z.record(z.string(), z.string()).optional(),
  oauth2: OAuth2Config.optional(),
});
export type StreamableHttpServerConfig = z.infer<typeof StreamableHttpServerConfig>;

export const ServerConfig = z.discriminatedUnion('type', [
  StdioServerConfig,
  SseServerConfig,
  StreamableHttpServerConfig,
]);
export type ServerConfig = z.infer<typeof ServerConfig>;

/**
 * Basic configuration shape - ensures we have mcpServers object
 * but doesn't validate individual server configs yet
 */
export const BasicConfiguration = z
  .object({
    mcpServers: z.record(z.string(), z.unknown()),
    _managed: z.boolean().optional(),
  })
  .meta({ title: 'Duo MCP config basic shape' });

export type BasicConfiguration = z.infer<typeof BasicConfiguration>;

/**
 * Full validated configuration with all server configs parsed
 */
export const Configuration = z
  .object({
    mcpServers: z.record(ServerName, ServerConfig),
    _managed: z.boolean().optional(),
  })
  .meta({ title: 'Duo MCP config root' });

export type Configuration = z.infer<typeof Configuration>;
