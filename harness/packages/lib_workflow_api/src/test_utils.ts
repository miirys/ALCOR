import { RESTError } from '@gitlab-org/core';
import type { ApiRequest } from '@gitlab-org/core';
import { createFakePartial } from '@gitlab-org/test-utils';

/**
 * Creates a RESTError that satisfies `isUsageQuotaExceededError`.
 * Use this in tests that exercise quota-exceeded error handling paths.
 */
export function createQuotaExceededError(): RESTError {
  const fakeRequest = createFakePartial<ApiRequest<unknown>>({
    type: 'rest',
    method: 'POST',
    path: '/api/v4/ai/duo_workflows/direct_access',
  });
  const fakeResponse = createFakePartial<Response>({
    ok: false,
    url: 'https://example.com/api/v4/ai/duo_workflows/direct_access',
    status: 400,
  });
  return new RESTError(
    fakeRequest,
    fakeResponse,
    'duo workflows',
    '{"message":"Consumer does not have sufficient credits. Error code: USAGE_QUOTA_EXCEEDED"}',
  );
}
