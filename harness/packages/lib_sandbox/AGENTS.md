# lib_sandbox — Agent Instructions

Sandbox package for running processes (workflow workers, MCP servers) inside `srt` (Anthropic Sandbox Runtime).

## Architecture

- **`SandboxAvailabilityService`** — detects platform support (macOS/Linux only) and srt dependencies
- **`SandboxConfigService`** — builds per-workspace/per-server `SandboxConfig` with filesystem and network restrictions; LRU-cached by `${workspacePath}:${serverName}`
- **`DesktopMcpStdioSandboxWrapper`** — implements `McpStdioCommandTransformer` (defined in `lib_ai_configuration`); prefixes STDIO MCP server commands with srt CLI; gated behind `duo.sandbox.enabled`
- **`WorkerProcessManager`** — spawns workflow worker processes; delegates sandbox wrapping to a `SandboxProvider`
- **`SandboxProvider` / `SrtProvider`** — provider seam translating a `SandboxConfig` into a jailed `WrappedInvocation`; `SrtProvider` is the bundled SDK-backed default
- **`SandboxAwareActionExecutorFactory`** — returns sandboxed or direct executor based on `duo.sandbox.enabled`

## Config types

Type definitions in `src/sandbox_config_types.ts`.

`SandboxConfig` -> `SandboxRuntimeConfig` conversion: map `network` and `filesystem` fields, default `deniedDomains` to `[]`. See `toSandboxRuntimeConfig()` in `desktop_mcp_stdio_sandbox_wrapper.ts` and the equivalent in `srt_provider.ts`.

## Testing

- `@anthropic-ai/sandbox-runtime` is ESM-only. Mock with factory: `jest.mock('@anthropic-ai/sandbox-runtime', () => ({ SandboxManager: { checkDependencies: jest.fn() } }))`
- `DesktopMcpStdioSandboxWrapper` constructor accepts an optional `srtCliPathOverride` parameter (not in DI deps) — pass `null` in tests to simulate srt unavailability.

## Caching

`DesktopSandboxConfigService.getMcpServerConfig()` caches by `${workspacePath}:${serverName}`. Only no-override calls are cached; override-merged configs are NOT cached to prevent overrides from leaking into subsequent no-override calls.
