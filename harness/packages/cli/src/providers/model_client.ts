import Anthropic from '@anthropic-ai/sdk';
import { ProviderRegistry, type ProviderConfig, type StoredCredential } from './provider_registry';
import { refreshAnthropicToken } from './anthropic_oauth';
import { createOpenAICompatClient, type AgentModelClient } from './openai_compat_client';

const ANTHROPIC_DEFAULT_BASE = 'https://api.anthropic.com';

/**
 * Build the agent's model client for the active direct provider, refreshing
 * OAuth credentials when expired. The returned client is either the real
 * Anthropic SDK (anthropic-kind providers) or the OpenAI-compat adapter.
 */
export async function createModelClient(
  provider: ProviderConfig,
  credential: StoredCredential,
  registry: ProviderRegistry,
): Promise<AgentModelClient> {
  let cred = credential;
  if (cred.type === 'oauth' && cred.expires < Date.now()) {
    cred = await refreshAnthropicToken(cred.refresh);
    registry.setCredential(provider.id, cred);
  }

  if (provider.kind === 'anthropic') {
    const baseURL = provider.baseUrl === ANTHROPIC_DEFAULT_BASE ? undefined : provider.baseUrl;
    if (cred.type === 'oauth') {
      // Subscription tokens require the OAuth beta and Bearer auth.
      return new Anthropic({
        baseURL,
        apiKey: null,
        authToken: cred.access,
        defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20,claude-code-20250219' },
      });
    }
    return new Anthropic({ baseURL, apiKey: cred.key });
  }

  const key = cred.type === 'api_key' ? cred.key : cred.access;
  return createOpenAICompatClient({ baseUrl: provider.baseUrl, apiKey: key });
}
