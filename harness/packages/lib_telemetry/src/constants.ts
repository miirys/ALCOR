import { ClientInfo, IdeInfo } from '@gitlab-org/config';

export const SAAS_INSTANCE_URL = 'https://gitlab.com';
export const TELEMETRY_NOTIFICATION = '$/gitlab/telemetry';
export const GC_TIME = 60000;

export interface IClientContext {
  ide?: IdeInfo;
  extension?: ClientInfo;
}
