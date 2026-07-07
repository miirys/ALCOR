import { getRemoteInfo, GetRemoteInfoResult, HttpClient } from 'isomorphic-git';
import { LsFetch } from '@gitlab-org/fetch';
import { convertToHttpUrl } from '@gitlab-org/core';
import { log } from '../../log';

export async function getRemoteRepositoryInfo(
  lsFetch: LsFetch,
  remoteUrl: string,
): Promise<GetRemoteInfoResult> {
  log.debug(`Getting default branch from remote "${remoteUrl}"`);

  const gitHttpClient: HttpClient = {
    request: async ({ url, method = 'GET', headers = {}, body }) => {
      let requestBody: BodyInit | undefined;
      if (body) {
        const chunks: Uint8Array[] = [];
        for await (const chunk of body) {
          chunks.push(chunk);
        }
        requestBody = new Uint8Array(Buffer.concat(chunks));
      }

      const response = await lsFetch.fetch(url, {
        method,
        headers,
        body: requestBody,
      });

      const responseBody = async function* responseBodyGenerator() {
        const buffer = await response.arrayBuffer();
        yield new Uint8Array(buffer);
      };

      const headerRecord: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headerRecord[key] = value;
      });

      return {
        url: response.url,
        method,
        statusCode: response.status,
        statusMessage: response.statusText,
        headers: headerRecord,
        body: responseBody(),
      };
    },
  };

  const url = convertToHttpUrl(remoteUrl);
  log.debug(`Repository remote URL as HTTP URL: "${url}"`);

  return getRemoteInfo({
    http: gitHttpClient,
    url,

    // Note, we're currently supporting only public / unauthenticated repositories for getRemoteInfo
    onAuth: () => undefined,
    onAuthSuccess: () => undefined,
    onAuthFailure: () => undefined,
  });
}
