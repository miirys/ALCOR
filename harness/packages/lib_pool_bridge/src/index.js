// First-party, in-process pool bridge (formerly duo-bridge-v0.8.4.3). Only the
// pool-management surface is embedded — the OpenAI/Anthropic proxy server and
// its routes are intentionally NOT included (the brief forbids a request-path
// proxy). GroupPoolManager owns pool state + namespace switching; the credit
// ledger owns the threshold/switch decision.
export { GroupPoolManager } from './pool_manager.js';
export { loadConfig } from './config.js';
export { createLogger, colors, startLogServer, getLogServerUrl } from './log.js';
