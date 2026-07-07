import { ApiRequest, GitLabVersionResponse } from '../types';

export const versionRequest: ApiRequest<GitLabVersionResponse> = {
  type: 'rest',
  method: 'GET',
  path: '/api/v4/version',
};
