import { getLanguageServerVersion } from '@gitlab-org/core';
import { IClientContext } from '../constants';

export const DEFAULT_TRACKING_ENDPOINT = 'https://snowplowprd.trx.gitlab.net';
export const DEFAULT_SNOWPLOW_OPTIONS = {
  appId: 'gitlab_ide_extension',
  timeInterval: 5000,
  maxItems: 10,
  isEventForwarding: false,
};

export const EVENT_VALIDATION_ERROR_MSG = `Telemetry event context is not valid  - event won't be tracked.`;

export const MIN_VERSION_FOR_EVENT_FORWARDING = '18.0.0';
export const MIN_VERSION_FOR_GITLAB_STANDARD_CONTEXT = '19.0.0';

export interface ISnowplowClientContext {
  schema: string;
  data: {
    ide_name?: string | null;
    ide_vendor?: string | null;
    ide_version?: string | null;
    extension_name?: string | null;
    extension_version?: string | null;
    language_server_version?: string | null;
  };
}

export const IDE_EXTENSION_VERSION_SCHEMA =
  'iglu:com.gitlab/ide_extension_version/jsonschema/1-1-0';

export function buildSnowplowClientContextData(
  context: IClientContext,
): ISnowplowClientContext['data'] {
  return {
    ide_name: context?.ide?.name ?? null,
    ide_vendor: context?.ide?.vendor ?? null,
    ide_version: context?.ide?.version ?? null,
    extension_name: context?.extension?.name ?? null,
    extension_version: context?.extension?.version ?? null,
    language_server_version: getLanguageServerVersion() ?? null,
  };
}

export function createSnowplowClientContext(): ISnowplowClientContext {
  return { schema: IDE_EXTENSION_VERSION_SCHEMA, data: {} };
}
