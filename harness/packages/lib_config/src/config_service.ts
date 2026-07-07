import { WorkspaceFolder, InitializeParams } from 'vscode-languageserver';
import { set, get, mergeWith, isArray } from 'lodash-es';
import { z } from 'zod';
import { Injectable, createInterfaceId } from '@gitlab/needle';
import { LOG_LEVEL, LogLevel } from '@gitlab-org/logging';
import { Event, EventEmitterImpl, diffEmitter, GITLAB_API_BASE_URL } from '@gitlab-org/core';

import { IHttpAgentOptions, IKnowledgeGraphConfig } from './client_config';
import type { TypedGetter, TypedSetter } from './type_utils.d';

// this eslint violation predates the new enum naming rules
/* eslint-disable @typescript-eslint/naming-convention */
export enum CODE_SUGGESTIONS_TRACKING_EVENTS {
  REQUESTED = 'suggestion_requested',
  LOADED = 'suggestion_loaded',
  NOT_PROVIDED = 'suggestion_not_provided',
  SHOWN = 'suggestion_shown',
  ERRORED = 'suggestion_error',
  ACCEPTED = 'suggestion_accepted',
  REJECTED = 'suggestion_rejected',
  CANCELLED = 'suggestion_cancelled',
  STREAM_STARTED = 'suggestion_stream_started',
  STREAM_COMPLETED = 'suggestion_stream_completed',
}
/* eslint-enable @typescript-eslint/naming-convention */

export type ClientInfo = InitializeParams['clientInfo'];

export enum SuggestionSource {
  // this eslint violation predates the new enum naming rules
  // eslint-disable-next-line @typescript-eslint/naming-convention
  cache = 'cache',
  // this eslint violation predates the new enum naming rules
  // eslint-disable-next-line @typescript-eslint/naming-convention
  network = 'network',
}

export interface IdeInfo {
  name: string;
  version: string;
  vendor: string;
}

export interface ITelemetryOptions {
  enabled?: boolean;
  baseUrl?: string;
  trackingUrl?: string;
  actions?: { action: CODE_SUGGESTIONS_TRACKING_EVENTS }[];
  ide?: IdeInfo;
  extension?: ClientInfo;
}

export interface IChatConfig {
  enabled?: boolean;
}

export const CodeSuggestionsConfig = z.object({
  enabled: z.boolean().optional(),
  enableSecretRedaction: z.boolean().optional(),
  additionalLanguages: z.array(z.string()).optional(),
  disabledSupportedLanguages: z.array(z.string()).optional(),
});

export interface ISuggestionsCacheOptions {
  enabled?: boolean;
  maxSize?: number;
  ttl?: number;
  prefixLines?: number;
  suffixLines?: number;
}

export interface ISecurityScannerOptions {
  enabled?: boolean;
}

/**
 * Delivery channel for CLI system notifications.
 * - `auto`: detect the terminal and notify via the most appropriate mechanism.
 * - `disabled`: never notify.
 */
export type NotificationChannel = 'auto' | 'disabled';

/**
 * System notifications for the CLI. Notifications alert the user when a session needs
 * attention (approval required, response ready, or error) while the terminal is unfocused.
 */
export interface INotificationsConfig {
  channel: NotificationChannel;
}

export const ModelPreferences = z.object({
  chat: z
    .object({
      name: z.string(),
      ref: z.string(),
    })
    .optional(),
});

export interface IDuoConfig {
  enabledWithoutGitlabProject?: boolean;

  agentPlatform?: {
    enabled: boolean;
    defaultNamespace?: string;
  };

  modelPreferences?: z.infer<typeof ModelPreferences>;

  sessionTrackingEnabled?: boolean;

  workflow?: Record<string, never>;

  sandbox?: {
    enabled?: boolean;
  };
}

export interface VirtualWorkspaceProjectInfo {
  /** Matches WorkspaceFolder.uri — e.g. "adt://host/path" or "gitlab-remote://host/path" */
  workspaceFolderUri: string;
  /** GitLab project full path — e.g. "gitlab-org/editor-extensions/gitlab-lsp" */
  projectPath: string;
  /** Git remote name, defaults to "origin" */
  remoteName?: string;
}

// TODO: define this whole type as zod schema so that we can validate incoming config
// TODO: move ClientConfig into workspace package so it can be used by other packages: https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/1005
export interface ClientConfig {
  /** GitLab API URL used for getting code suggestions */
  baseUrl?: string;
  /**
   * @deprecated Use the Repository Service instead of the `projectPath`. The `projectPath` is a legacy property that can contain a wrong value in multi-project workspaces. See https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/1156 for more details
   * */
  projectPath?: string;
  /** PAT or OAuth token used to authenticate to GitLab API */
  token?: string | undefined | ''; // empty string is used by clients to clear the token
  /** Optional hint for the type of token provided, skips unnecessary validation call when set */
  tokenType?: 'pat' | 'oauth';
  /** The base URL for language server assets in the client-side extension */
  baseAssetsUrl?: string;
  clientInfo?: ClientInfo;
  // FIXME: this key should be codeSuggestions (we have code completion and code generation)
  codeCompletion?: z.infer<typeof CodeSuggestionsConfig>;
  duoChat?: IChatConfig;
  openTabsContext?: boolean;
  telemetry?: ITelemetryOptions;
  /** Config used for caching code suggestions */
  suggestionsCache?: ISuggestionsCacheOptions;
  workspaceFolders?: WorkspaceFolder[] | null;

  /** Current working directory the process is running at. Usually this will be a workspaceFolder but not always (e.g. when CLI is launched from a subdirectory) */
  cwd?: string;

  /** Detected project root namespace id, or the user's default configured Duo namespace id */
  rootNamespaceId?: string;

  /** Collection of Feature Flag values which are sent from the client */
  featureFlags?: Record<string, boolean>;
  logLevel?: LogLevel;
  ignoreCertificateErrors?: boolean;
  httpAgentOptions?: IHttpAgentOptions;

  securityScannerOptions?: ISecurityScannerOptions;
  notifications?: INotificationsConfig;
  duo?: IDuoConfig;
  featureFlagOverrides?: Record<string, boolean>;
  knowledgeGraph?: IKnowledgeGraphConfig;

  /** Optional Git HTTP authentication config */
  gitHttpUser?: string;
  gitHttpPassword?: string;
  gitUserName?: string;
  gitUserEmail?: string;
  gitAuthorName?: string;
  gitAuthorEmail?: string;
  /**
   * The following properties are only relevant to the web build of the
   * language server that is used by the Web IDE. The Web IDE
   * is a limited environment where only a single project, workspace, and
   * repository can be opened at a single time. Also, the git operations are
   * limited. In this environment, we can rely on configuration properties to
   * tell the language server the resource it needs to reference in features.
   */
  webIdeCurrentRef?: string;

  webIdeProjectPath?: string;

  /** Whether global agent skills discovery is enabled (--enable-global-skills) */
  enableGlobalSkills?: boolean;

  /** IDE-supplied project metadata for virtual (non-file://) workspace folders */
  virtualWorkspaceProjects?: VirtualWorkspaceProjectInfo[];
}

/**
 * ConfigService manages user configuration (e.g. baseUrl) and application state (e.g. codeCompletion.enabled)
 * TODO: Maybe in the future we would like to separate these two
 */
export interface ConfigService {
  get: TypedGetter<ClientConfig>;
  /**
   * set sets the property of the config
   * the new value completely overrides the old one
   */
  set: TypedSetter<ClientConfig>;
  onConfigChange: Event<ClientConfig>;
  /**
   * merge adds `newConfig` properties into existing config, if the
   * property is present in both old and new config, `newConfig`
   * properties take precedence unless not defined
   *
   * This method performs deep merge
   *
   * **Arrays are not merged; they are replaced with the new value.**
   *
   */
  merge(newConfig: Partial<ClientConfig>): void;
}

export const ConfigService = createInterfaceId<ConfigService>('ConfigService');

@Injectable(ConfigService, [])
export class DefaultConfigService implements ConfigService {
  #config: ClientConfig;

  #eventEmitter = diffEmitter(new EventEmitterImpl<ClientConfig>());

  constructor() {
    this.#config = {
      baseUrl: GITLAB_API_BASE_URL,
      codeCompletion: {
        enableSecretRedaction: true,
      },
      telemetry: {
        enabled: true,
      },
      logLevel: LOG_LEVEL.INFO,
      ignoreCertificateErrors: false,
      httpAgentOptions: {},
      duo: {
        enabledWithoutGitlabProject: true,
      },
      notifications: {
        channel: 'auto',
      },
      featureFlagOverrides: {},
      knowledgeGraph: {},
    };
  }

  get: TypedGetter<ClientConfig> = (key?: string) => {
    return key ? get(this.#config, key) : this.#config;
  };

  set: TypedSetter<ClientConfig> = (key: string, value: unknown) => {
    set(this.#config, key, value);
    this.#eventEmitter.fire(this.#config);
  };

  onConfigChange = this.#eventEmitter.event;

  merge(newConfig: Partial<ClientConfig>) {
    mergeWith(this.#config, newConfig, (target, src) => (isArray(target) ? src : undefined));
    this.#eventEmitter.fire(this.#config);
  }
}

export const exampleConfig: ClientConfig = {
  // TODO as we introduce validation for more properties, we should add them here
  codeCompletion: {
    enabled: true,
    enableSecretRedaction: true,
    additionalLanguages: ['clojure'],
    disabledSupportedLanguages: ['handlebars'],
  },
};
