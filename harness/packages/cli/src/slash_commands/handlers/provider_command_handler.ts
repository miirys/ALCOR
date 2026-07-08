import { Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { doNotAwait } from '@gitlab-org/core';
import {
  CLI_INPUT_TYPES,
  defaultInputState,
  ProviderWizardInput,
  providerWizardFooterHint,
  type ProviderWizardCallbacks,
  type ProviderWizardInputState,
  type ProviderWizardProvider,
} from '@gitlab-org/tui';
import type { ControllerApi } from '../../commands/tui/controller_api';
import {
  SlashCommandHandler,
  type SlashCommand,
  type CommandComponentEntry,
} from '../slash_command_handler';
import {
  ProviderRegistry,
  type ProviderConfig,
  type StoredCredential,
} from '../../providers/provider_registry';
import { beginAnthropicLogin } from '../../providers/anthropic_oauth';

type WizardState = Omit<ProviderWizardInputState, 'inputType'>;

interface CustomDraft {
  id?: string;
  baseUrl?: string;
  kind?: 'anthropic' | 'openai';
}

/**
 * Wizard session state shared across the four command handlers. The component
 * registry keeps a single entry per inputType (the last registration wins),
 * so callbacks may be dispatched through a different handler instance than
 * the one that opened the wizard — instance fields would desync.
 */
const wizard: {
  mode: ProviderWizardInputState['mode'];
  providerId?: string;
  customDraft: CustomDraft;
  pendingOAuth?: ReturnType<typeof beginAnthropicLogin>;
} = { mode: 'login', customDraft: {} };

/**
 * Drives the provider wizard behind /login, /logout, /providers, and
 * /setup-custom-provider. All state transitions run here; the TUI component
 * only renders steps and reports selections.
 */
@Injectable(SlashCommandHandler, [Logger])
export class DefaultLoginCommandHandler implements SlashCommandHandler<ProviderWizardCallbacks> {
  protected registry = new ProviderRegistry();

  protected logger: Logger;

  command: SlashCommand = {
    name: '/login',
    description: 'Sign in to a model provider (Anthropic, OpenAI, Google, …)',
    action: 'login',
  };

  constructor(logger: Logger) {
    this.logger = withPrefix(logger, '[ProviderWizard]');
  }

  async execute(api: ControllerApi): Promise<void> {
    this.open(api, 'login');
  }

  getComponent(api: ControllerApi): CommandComponentEntry<ProviderWizardCallbacks> {
    return {
      inputType: CLI_INPUT_TYPES.PROVIDER_WIZARD,
      component: ProviderWizardInput,
      footerHint: providerWizardFooterHint,
      callbacks: {
        onSelectProvider: (id) => this.#handleProvider(api, id),
        onSelectMethod: (method) => doNotAwait(this.#handleMethod(api, method)),
        onSubmitText: (text) => doNotAwait(this.#handleText(api, text)),
        onSelectModel: (model) => this.#handleModel(api, model),
        onClose: () => this.#close(api),
      },
    };
  }

  protected open(api: ControllerApi, mode: ProviderWizardInputState['mode']): void {
    wizard.mode = mode;
    wizard.customDraft = {};
    wizard.providerId = undefined;
    if (mode === 'custom') {
      this.#setState(api, { mode, step: 'custom_form', customField: 'id', providers: [] });
      return;
    }
    const providers =
      mode === 'logout' ? this.registry.authenticatedProviders() : this.registry.listProviders();
    this.#setState(api, { mode, step: 'provider', providers: this.#rows(providers) });
  }

  #rows(providers: ProviderConfig[]): ProviderWizardProvider[] {
    const active = this.registry.getActive();
    return providers.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      baseUrl: p.baseUrl,
      authenticated: Boolean(this.registry.getCredential(p.id)),
      active: active?.providerId === p.id,
      oauth: p.oauth,
      custom: p.custom,
    }));
  }

  #setState(api: ControllerApi, state: WizardState): void {
    api.mutateState((s) => ({
      ...s,
      input: { inputType: CLI_INPUT_TYPES.PROVIDER_WIZARD, ...state },
    }));
  }

  #close(api: ControllerApi): void {
    wizard.pendingOAuth?.cancel();
    wizard.pendingOAuth = undefined;
    api.mutateState((s) => ({ ...s, input: defaultInputState }));
  }

  #handleProvider(api: ControllerApi, id: string): void {
    wizard.providerId = id;
    const provider = this.registry.getProvider(id);
    if (!provider) return;

    if (wizard.mode === 'logout') {
      this.registry.removeCredential(id);
      this.#setState(api, {
        mode: wizard.mode,
        step: 'done',
        providers: [],
        message: `Signed out of ${provider.name}. ${
          this.registry.getActive() ? '' : 'GitLab Duo is the fallback until the next login.'
        }`,
      });
      return;
    }

    // /providers on an authenticated provider jumps straight to model pick;
    // /login (or an unauthenticated provider) goes through auth first.
    const credential = this.registry.getCredential(id);
    if (wizard.mode === 'providers' && credential) {
      doNotAwait(this.#discoverAndPickModel(api, provider, credential));
      return;
    }

    if (provider.oauth) {
      this.#setState(api, { mode: wizard.mode, step: 'method', providers: [], providerId: id });
    } else {
      this.#setState(api, { mode: wizard.mode, step: 'api_key', providers: [], providerId: id });
    }
  }

  async #handleMethod(api: ControllerApi, method: 'api_key' | 'oauth'): Promise<void> {
    if (method === 'api_key') {
      this.#setState(api, {
        mode: wizard.mode,
        step: 'api_key',
        providers: [],
        providerId: wizard.providerId,
      });
      return;
    }

    const pending = beginAnthropicLogin();
    wizard.pendingOAuth = pending;
    this.#setState(api, {
      mode: wizard.mode,
      step: 'oauth_wait',
      providers: [],
      providerId: wizard.providerId,
      oauthUrl: pending.url,
    });

    try {
      const credential = await pending.credential;
      if (wizard.pendingOAuth !== pending) return; // cancelled/superseded
      wizard.pendingOAuth = undefined;
      await this.#storeAndContinue(api, credential);
    } catch (error) {
      if (wizard.pendingOAuth !== pending) return;
      wizard.pendingOAuth = undefined;
      this.#fail(api, error);
    }
  }

  async #handleText(api: ControllerApi, text: string): Promise<void> {
    const value = text.trim();

    if (wizard.mode === 'custom') {
      await this.#handleCustomField(api, value);
      return;
    }

    // OAuth manual paste path
    if (wizard.pendingOAuth) {
      this.#setState(api, {
        mode: wizard.mode,
        step: 'busy',
        providers: [],
        message: 'Exchanging authorization code…',
      });
      wizard.pendingOAuth.submitManualCode(value);
      return;
    }

    // API key path
    if (!value) return;
    await this.#storeAndContinue(api, { type: 'api_key', key: value });
  }

  async #storeAndContinue(api: ControllerApi, credential: StoredCredential): Promise<void> {
    const provider = wizard.providerId ? this.registry.getProvider(wizard.providerId) : undefined;
    if (!provider) return;
    this.#setState(api, {
      mode: wizard.mode,
      step: 'busy',
      providers: [],
      message: `Validating credentials against ${provider.name}…`,
    });
    try {
      const models = await this.registry.discoverModels(provider, credential);
      this.registry.setCredential(provider.id, credential);
      this.#setState(api, {
        mode: wizard.mode,
        step: 'model',
        providers: [],
        providerId: provider.id,
        models,
      });
    } catch (error) {
      this.#fail(api, error);
    }
  }

  async #discoverAndPickModel(
    api: ControllerApi,
    provider: ProviderConfig,
    credential: StoredCredential,
  ): Promise<void> {
    this.#setState(api, {
      mode: wizard.mode,
      step: 'busy',
      providers: [],
      message: `Listing models from ${provider.name}…`,
    });
    try {
      const models = await this.registry.discoverModels(provider, credential);
      this.#setState(api, {
        mode: wizard.mode,
        step: 'model',
        providers: [],
        providerId: provider.id,
        models,
      });
    } catch (error) {
      this.#fail(api, error);
    }
  }

  #handleModel(api: ControllerApi, model: string): void {
    if (!wizard.providerId) return;
    this.registry.setActive({ providerId: wizard.providerId, model });
    const provider = this.registry.getProvider(wizard.providerId);
    this.#setState(api, {
      mode: wizard.mode,
      step: 'done',
      providers: [],
      message: `${provider?.name ?? wizard.providerId} · ${model} is now the active model. Restart ALCOR to apply it to this session.`,
    });
  }

  async #handleCustomField(api: ControllerApi, value: string): Promise<void> {
    const draft = wizard.customDraft;
    if (!draft.id) {
      if (!value) return;
      draft.id = value.toLowerCase().replaceAll(/[^a-z0-9-]+/g, '-');
      this.#setState(api, {
        mode: 'custom',
        step: 'custom_form',
        customField: 'baseUrl',
        providers: [],
      });
      return;
    }
    if (!draft.baseUrl) {
      if (!value) return;
      draft.baseUrl = value.replace(/\/$/, '');
      this.#setState(api, {
        mode: 'custom',
        step: 'custom_form',
        customField: 'kind',
        providers: [],
      });
      return;
    }
    if (!draft.kind) {
      draft.kind = value === 'anthropic' ? 'anthropic' : 'openai';
      this.#setState(api, {
        mode: 'custom',
        step: 'custom_form',
        customField: 'apiKey',
        providers: [],
      });
      return;
    }

    // Final field: API key → register, validate, pick model.
    const config: ProviderConfig = {
      id: draft.id,
      name: draft.id,
      kind: draft.kind,
      baseUrl: draft.baseUrl,
    };
    this.registry.addCustomProvider(config);
    wizard.providerId = config.id;
    await this.#storeAndContinue(api, { type: 'api_key', key: value });
  }

  #fail(api: ControllerApi, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Provider wizard error: ${message}`);
    this.#setState(api, {
      mode: wizard.mode,
      step: 'done',
      providers: [],
      message,
      isError: true,
    });
  }
}

/** `/logout` — remove a stored provider credential. */
@Injectable(SlashCommandHandler, [Logger])
export class DefaultLogoutCommandHandler extends DefaultLoginCommandHandler {
  override command: SlashCommand = {
    name: '/logout',
    description: 'Sign out of a model provider',
    action: 'logout',
  };

  override async execute(api: ControllerApi): Promise<void> {
    this.open(api, 'logout');
  }
}

/** `/providers` — list providers, switch the active provider/model. */
@Injectable(SlashCommandHandler, [Logger])
export class DefaultProvidersCommandHandler extends DefaultLoginCommandHandler {
  override command: SlashCommand = {
    name: '/providers',
    description: 'List model providers · switch the active one',
    action: 'providers',
  };

  override async execute(api: ControllerApi): Promise<void> {
    this.open(api, 'providers');
  }
}

/** `/setup-custom-provider` — register any OpenAI/Anthropic-compatible endpoint. */
@Injectable(SlashCommandHandler, [Logger])
export class DefaultCustomProviderCommandHandler extends DefaultLoginCommandHandler {
  override command: SlashCommand = {
    name: '/setup-custom-provider',
    description: 'Add a custom OpenAI/Anthropic-compatible endpoint',
    action: 'setup-custom-provider',
  };

  override async execute(api: ControllerApi): Promise<void> {
    this.open(api, 'custom');
  }
}
