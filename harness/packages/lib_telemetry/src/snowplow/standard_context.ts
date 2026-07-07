import { SelfDescribingJson } from '@snowplow/tracker-core';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { ConfigService, ClientConfig } from '@gitlab-org/config';
import { UserService } from '@gitlab-org/core';
import { SAAS_INSTANCE_URL } from '../constants';

export const ENVIRONMENT_NAMES = {
  GITLAB_COM: 'production',
  GITLAB_STAGING: 'staging',
  GITLAB_ORG: 'org',
  GITLAB_DEVELOPMENT: 'development',
  GITLAB_SELF_MANAGED: 'self-managed',
};

export const ENVIRONMENT_URLS = {
  GITLAB_COM: 'https://gitlab.com',
  GITLAB_STAGING: 'https://staging.gitlab.com',
  GITLAB_ORG: 'https://dev.gitlab.org',
  GITLAB_DEVELOPMENT: 'http://localhost',
};
export const STANDARD_CONTEXT_SCHEMA = 'iglu:com.gitlab/gitlab_standard/jsonschema/1-1-1';
const DEFAULT_EVENT_SOURCE = 'Language Server';
export interface StandardContext {
  build(extra?: { [key: string]: string }): SelfDescribingJson;
}

export const StandardContext = createInterfaceId<StandardContext>('StandardContext');

@Injectable(StandardContext, [ConfigService, UserService])
export class DefaultStandardContext implements StandardContext {
  // TODO: add all available schema fields
  #source = DEFAULT_EVENT_SOURCE;

  #environment = ENVIRONMENT_NAMES.GITLAB_COM;

  #hostName = ENVIRONMENT_URLS.GITLAB_COM;

  #userService: UserService;

  constructor(configService: ConfigService, userService: UserService) {
    this.#userService = userService;
    this.#setConfigDataToContext(configService.get());

    configService.onConfigChange((config) => this.#setConfigDataToContext(config));
  }

  #setConfigDataToContext(config: ClientConfig) {
    this.#source = config?.telemetry?.extension?.name ?? DEFAULT_EVENT_SOURCE;
    this.#hostName = config?.baseUrl ?? SAAS_INSTANCE_URL;
    this.#environment = environmentFromHost(this.#hostName);
  }

  build(extra?: { [key: string]: string }): SelfDescribingJson {
    return {
      schema: STANDARD_CONTEXT_SCHEMA,
      data: {
        source: this.#source,
        extra,
        environment: this.#environment,
        host_name: this.#hostName,
        user_id: this.#userService.user?.restId ?? null,
      },
    };
  }
}

export function environmentFromHost(url: string): string {
  const { GITLAB_COM, GITLAB_STAGING, GITLAB_ORG, GITLAB_DEVELOPMENT } = ENVIRONMENT_URLS;

  if (url === GITLAB_COM) return ENVIRONMENT_NAMES.GITLAB_COM;
  if (url === GITLAB_STAGING) return ENVIRONMENT_NAMES.GITLAB_STAGING;
  if (url === GITLAB_ORG) return ENVIRONMENT_NAMES.GITLAB_ORG;
  if (url.includes(GITLAB_DEVELOPMENT)) return ENVIRONMENT_NAMES.GITLAB_DEVELOPMENT;

  return ENVIRONMENT_NAMES.GITLAB_SELF_MANAGED;
}
