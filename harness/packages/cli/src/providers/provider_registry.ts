import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * ALCOR provider registry — the local, GitLab-independent model layer.
 *
 * Providers speak one of two wire formats:
 *  - 'anthropic'  → Anthropic Messages API (native SDK)
 *  - 'openai'     → OpenAI-compatible chat/completions (covers OpenAI, Google
 *                   AI Studio & Vertex express endpoints, Groq, OpenRouter,
 *                   xAI, DeepSeek, Mistral, local gateways, …)
 *
 * Credentials live in ~/.alcor/auth.json (0600); provider definitions and the
 * active provider/model selection live in ~/.alcor/providers.json. GitLab Duo
 * remains available as the fallback provider when nothing is configured.
 */

export type ProviderKind = 'anthropic' | 'openai';

export interface ProviderConfig {
  id: string;
  name: string;
  kind: ProviderKind;
  /** API base, e.g. https://api.openai.com/v1 (openai) or https://api.anthropic.com (anthropic). */
  baseUrl: string;
  /** True for providers added via /setup-custom-provider. */
  custom?: boolean;
  /** Cached model ids from the last discovery. */
  models?: string[];
  /** Supports the Anthropic subscription OAuth flow. */
  oauth?: boolean;
}

export type StoredCredential =
  | { type: 'api_key'; key: string }
  | { type: 'oauth'; access: string; refresh: string; expires: number };

export interface ActiveModel {
  providerId: string;
  model: string;
}

export const BUILTIN_PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    oauth: true,
  },
  { id: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1' },
  {
    id: 'google',
    name: 'Google (Gemini · AI Studio / Vertex express)',
    kind: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  },
  { id: 'groq', name: 'Groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'openrouter', name: 'OpenRouter', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'xai', name: 'xAI', kind: 'openai', baseUrl: 'https://api.x.ai/v1' },
  { id: 'deepseek', name: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'mistral', name: 'Mistral', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1' },
];

const CONFIG_DIR = path.join(os.homedir(), '.alcor');
const PROVIDERS_FILE = path.join(CONFIG_DIR, 'providers.json');
const AUTH_FILE = path.join(CONFIG_DIR, 'auth.json');

interface ProvidersFile {
  custom?: ProviderConfig[];
  active?: ActiveModel;
  /** Cached discovery results per provider id. */
  models?: Record<string, string[]>;
}

const readJson = <T>(file: string): T | undefined => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
};

const writeJson = (file: string, data: unknown, secret = false): void => {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: secret ? 0o600 : 0o644 });
};

export class ProviderRegistry {
  #providers(): ProvidersFile {
    return readJson<ProvidersFile>(PROVIDERS_FILE) ?? {};
  }

  #auth(): Record<string, StoredCredential> {
    return readJson<Record<string, StoredCredential>>(AUTH_FILE) ?? {};
  }

  listProviders(): ProviderConfig[] {
    const file = this.#providers();
    const models = file.models ?? {};
    const all = [...BUILTIN_PROVIDERS, ...(file.custom ?? [])];
    return all.map((p) => ({ ...p, models: models[p.id] ?? p.models }));
  }

  getProvider(id: string): ProviderConfig | undefined {
    return this.listProviders().find((p) => p.id === id);
  }

  addCustomProvider(config: Omit<ProviderConfig, 'custom'>): void {
    const file = this.#providers();
    const custom = (file.custom ?? []).filter((p) => p.id !== config.id);
    custom.push({ ...config, custom: true });
    writeJson(PROVIDERS_FILE, { ...file, custom });
  }

  removeCustomProvider(id: string): void {
    const file = this.#providers();
    writeJson(PROVIDERS_FILE, { ...file, custom: (file.custom ?? []).filter((p) => p.id !== id) });
  }

  getCredential(providerId: string): StoredCredential | undefined {
    return this.#auth()[providerId];
  }

  setCredential(providerId: string, credential: StoredCredential): void {
    const auth = this.#auth();
    auth[providerId] = credential;
    writeJson(AUTH_FILE, auth, true);
  }

  removeCredential(providerId: string): void {
    const auth = this.#auth();
    delete auth[providerId];
    writeJson(AUTH_FILE, auth, true);
    const file = this.#providers();
    if (file.active?.providerId === providerId) {
      writeJson(PROVIDERS_FILE, { ...file, active: undefined });
    }
  }

  authenticatedProviders(): ProviderConfig[] {
    const auth = this.#auth();
    return this.listProviders().filter((p) => auth[p.id]);
  }

  getActive(): ActiveModel | undefined {
    return this.#providers().active;
  }

  setActive(active: ActiveModel | undefined): void {
    const file = this.#providers();
    writeJson(PROVIDERS_FILE, { ...file, active });
  }

  cacheModels(providerId: string, models: string[]): void {
    const file = this.#providers();
    writeJson(PROVIDERS_FILE, {
      ...file,
      models: { ...(file.models ?? {}), [providerId]: models },
    });
  }

  /**
   * List models from the provider's API. Anthropic: GET /v1/models.
   * OpenAI-compatible: GET {base}/models. Also validates the credential —
   * a 401/403 here means the key is bad.
   */
  async discoverModels(provider: ProviderConfig, credential: StoredCredential): Promise<string[]> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    let url: string;
    if (provider.kind === 'anthropic') {
      url = `${provider.baseUrl.replace(/\/$/, '')}/v1/models?limit=100`;
      headers['anthropic-version'] = '2023-06-01';
      if (credential.type === 'oauth') {
        headers.Authorization = `Bearer ${credential.access}`;
        headers['anthropic-beta'] = 'oauth-2025-04-20';
      } else {
        headers['x-api-key'] = credential.key;
      }
    } else {
      url = `${provider.baseUrl.replace(/\/$/, '')}/models`;
      const key = credential.type === 'api_key' ? credential.key : credential.access;
      headers.Authorization = `Bearer ${key}`;
    }

    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Model discovery failed (${response.status}): ${body.slice(0, 200)}`);
    }
    const json = (await response.json()) as {
      data?: { id: string }[];
      models?: { name: string }[];
    };
    const ids = (json.data ?? []).map((m) => m.id);
    // Google AI Studio nests under `models` with `models/` prefixes on some routes.
    if (ids.length === 0 && json.models) {
      return json.models.map((m) => m.name.replace(/^models\//, ''));
    }
    ids.sort();
    this.cacheModels(provider.id, ids);
    return ids;
  }
}

/**
 * Synchronous boot-time check used to pick the backend before DI exists:
 * true when a direct (non-GitLab) provider is active and has a credential.
 */
export function hasActiveDirectProvider(): boolean {
  const file = readJson<ProvidersFile>(PROVIDERS_FILE);
  const active = file?.active;
  if (!active) return false;
  const auth = readJson<Record<string, StoredCredential>>(AUTH_FILE) ?? {};
  return Boolean(auth[active.providerId]);
}
