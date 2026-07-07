import { transformHeadersToSnowplowOptions } from './headers_to_snowplow_options';

describe('transformHeadersToSnowplowOptions', () => {
  const mockInstanceId = '1';
  const mockGlobalUserId = '2';
  const mockHostName = 'https://test.gitlab.com';
  const mockDuoProNamespaceIds = [3, 4, 5];
  const mockFeatureEnablementType = 'duo';

  const headers = {
    'X-Gitlab-Instance-Id': mockInstanceId,
    'X-Gitlab-Global-User-Id': mockGlobalUserId,
    'X-Gitlab-Host-Name': mockHostName,
    'X-Gitlab-Saas-Duo-Pro-Namespace-Ids': mockDuoProNamespaceIds.join(','),
    'X-Gitlab-Feature-Enablement-Type': mockFeatureEnablementType,
  };

  it('should parse headers and return Snowplow tracking options', () => {
    expect(transformHeadersToSnowplowOptions(headers)).toEqual({
      gitlab_instance_id: mockInstanceId,
      gitlab_global_user_id: mockGlobalUserId,
      gitlab_host_name: mockHostName,
      gitlab_saas_duo_pro_namespace_ids: mockDuoProNamespaceIds,
      gitlab_feature_enablement_type: mockFeatureEnablementType,
    });
  });

  it('should handle empty "gitlab_saas_duo_pro_namespace_ids" header` value correctly', () => {
    const emptyHeader = {
      ...headers,
      'X-Gitlab-Saas-Duo-Pro-Namespace-Ids': '',
    };
    expect(
      transformHeadersToSnowplowOptions(emptyHeader).gitlab_saas_duo_pro_namespace_ids,
    ).toEqual([]);
  });

  it('should handle missing "X-Gitlab-Feature-Enablement-Type" header correctly', () => {
    const headersWithoutFeatureEnablement = {
      'X-Gitlab-Instance-Id': mockInstanceId,
      'X-Gitlab-Global-User-Id': mockGlobalUserId,
      'X-Gitlab-Host-Name': mockHostName,
      'X-Gitlab-Saas-Duo-Pro-Namespace-Ids': mockDuoProNamespaceIds.join(','),
    };

    const result = transformHeadersToSnowplowOptions(headersWithoutFeatureEnablement);
    expect(result.gitlab_feature_enablement_type).toBeUndefined();
  });
});
