import { get, transform } from 'lodash';
import { log } from '../log';
import { IDirectConnectionDetailsHeaders } from '../suggestion/direct_connection_details_service';

export interface ISnowplowTrackerOptions {
  gitlab_instance_id?: string;
  gitlab_global_user_id?: string;
  gitlab_host_name?: string;
  gitlab_saas_duo_pro_namespace_ids?: number[];
  gitlab_feature_enablement_type?: string;
}

export const transformHeadersToSnowplowOptions = (
  headers?: IDirectConnectionDetailsHeaders,
): ISnowplowTrackerOptions => {
  const normalizedHeaders = transform(
    headers ?? {},
    (result: Record<string, string>, value: unknown, key: string) => {
      /* eslint-disable-next-line no-param-reassign */
      result[key.toLowerCase()] = String(value);
    },
    {} as Record<string, string>,
  );

  let gitlabSaasDuoProNamespaceIds: number[] | undefined;

  try {
    gitlabSaasDuoProNamespaceIds = get(normalizedHeaders, 'x-gitlab-saas-duo-pro-namespace-ids', '')
      .split(',')
      .map((id) => parseInt(id, 10))
      .filter((id) => !Number.isNaN(id));
  } catch {
    log.debug('Failed to transform "x-gitlab-saas-duo-pro-namespace-ids" to telemetry options.');
  }

  return {
    gitlab_instance_id: get(normalizedHeaders, 'x-gitlab-instance-id'),
    gitlab_global_user_id: get(normalizedHeaders, 'x-gitlab-global-user-id'),
    gitlab_host_name: get(normalizedHeaders, 'x-gitlab-host-name'),
    gitlab_saas_duo_pro_namespace_ids: gitlabSaasDuoProNamespaceIds,
    gitlab_feature_enablement_type: get(normalizedHeaders, 'x-gitlab-feature-enablement-type'),
  };
};
