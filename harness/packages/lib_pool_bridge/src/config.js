import fs from 'node:fs';

/**
 * Bridge configuration, sourced from environment variables.
 * v8: path b (duo agent platform / flows api) driven over the Duo Workflow
 * Service websocket (level 3).
 */
export function loadConfig(env = process.env) {
  const int = (v, d) => {
    const n = Number.parseInt(v ?? '', 10);
    return Number.isFinite(n) ? n : d;
  };
  const list = (v) =>
    v
      ? String(v)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  const defaultCookiesPath = `${process.cwd()}/cookies.txt`;

  return {
    // http server
    port: int(env.DUO_BRIDGE_PORT, 8484),
    host: env.DUO_BRIDGE_HOST ?? '127.0.0.1',
    bridgeApiKey: env.DUO_BRIDGE_API_KEY || null,

    // gitlab instance credentials
    gitlabToken: env.GITLAB_TOKEN || env.DUO_BRIDGE_GITLAB_TOKEN || null,
    gitlabBaseUrl: env.GITLAB_BASE_URL || env.DUO_BRIDGE_GITLAB_URL || 'https://gitlab.com',

    // path b flows api. lives at the same gitlab host (/api/v4/ai/duo_workflows/*).
    duoAgentPlatformBaseUrl:
      env.DUO_BRIDGE_AGENT_PLATFORM_URL || env.GITLAB_BASE_URL || 'https://gitlab.com',

    // instance version. controls websocket close-code handling (1006 is a real
    // error on >= 18.5). maddie's instance is 19.2.0.
    instanceVersion: env.DUO_BRIDGE_INSTANCE_VERSION || '19.2.0',

    // websocket client capabilities advertised in startRequest. Empty by
    // default (baseline behaviour: full ui_chat_log per checkpoint, no approval
    // gating). Override e.g. DUO_BRIDGE_WS_CAPABILITIES="shell_command,web_search".
    wsCapabilities: list(env.DUO_BRIDGE_WS_CAPABILITIES),

    // workflow definition. server-side flows: chat, software_development, ...
    workflowType: env.DUO_BRIDGE_WORKFLOW_TYPE || 'chat',

    // opt-in: send an inline chat-partial flow_config (custom system prompt +
    // empty toolset) instead of the built-in chat workflow. Off by default
    // because the built-in workflow is what `glab duo` uses and is known-good.
    useFlowConfig: env.DUO_BRIDGE_USE_FLOW_CONFIG === 'true',

    // optional project/namespace defaults. normally set by the pool manager.
    defaultProjectId: env.DUO_BRIDGE_PROJECT_ID || null,
    defaultNamespaceId: env.DUO_BRIDGE_NAMESPACE_ID || null,

    // direct-access token cache ttl fallback
    directAccessTtlMs: int(env.DUO_BRIDGE_TOKEN_TTL_SECONDS, 50 * 60) * 1000,

    // request behaviour
    defaultMaxTokens: int(env.DUO_BRIDGE_DEFAULT_MAX_TOKENS, 8192),
    maxRetries: int(env.DUO_BRIDGE_MAX_RETRIES, 2),
    // v0.8.3.6: retry on empty duo response. Duo's chat graph in v19.2 is
    // non-deterministic — ~30-40% of short prompts return an empty agent turn
    // with no output anywhere in the checkpoint (ui_chat_log, plan.steps,
    // node_events all empty). Auto-retry on empty exploits the non-determinism
    // to raise the effective success rate. Skipped if we already streamed any
    // text to the caller (can't retry mid-stream) or if the workflow was
    // aborted / hit quota.
    maxEmptyRetries: int(env.DUO_BRIDGE_MAX_EMPTY_RETRIES, 2),
    workflowPollIntervalMs: int(env.DUO_BRIDGE_POLL_INTERVAL_MS, 800),
    workflowMaxWaitMs: int(env.DUO_BRIDGE_MAX_WAIT_MS, 600_000),
    maxBodyBytes: int(env.DUO_BRIDGE_MAX_BODY_BYTES, 50 * 1024 * 1024),

    // force every request to a specific model regardless of what clients send.
    modelOverride: env.DUO_BRIDGE_MODEL_OVERRIDE || null,

    // cookies + group pool
    cookiesPath: env.DUO_BRIDGE_COOKIES_PATH || defaultCookiesPath,
    groupsPoolPath: env.DUO_BRIDGE_GROUPS_POOL_PATH || `${process.cwd()}/groups_pool.json`,

    logLevel: env.DUO_BRIDGE_LOG_LEVEL || 'info',
    headless: env.DUO_BRIDGE_HEADLESS !== 'false',
  };
}
