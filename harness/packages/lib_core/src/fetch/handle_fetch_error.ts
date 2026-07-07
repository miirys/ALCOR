import { ApiRequest, FetchError } from '../gitlab_api';

export const handleFetchError = async (
  request: ApiRequest<unknown>,
  response: Response,
  resourceName: string,
) => {
  if (!response.ok) {
    const body = await response.text().catch(() => undefined);
    throw new FetchError(request, response, resourceName, body);
  }
};
