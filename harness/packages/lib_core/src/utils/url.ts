import { notNullOrUndefined } from './not_null_or_undefined';

export type QueryValue = string | boolean | string[] | number | undefined | null;

export const addQueryParams = (url: URL, query: Record<string, QueryValue>): URL => {
  Object.entries(query).forEach(([name, value]) => {
    if (notNullOrUndefined(value)) {
      url.searchParams.append(name, String(value));
    }
  });
  return url;
};

export const ensureEndsWithSlash = (url: string | URL) => url.toString().replace(/\/?$/, '/');

export const ensureRelativePath = (path: string) => path.replace(/^\.?\/?/, './');

/**
 * Handle various git remote formats (http, ssh etc) and convert them to http.
 * @param remoteUrl - The git remote URL to convert
 * @returns The HTTP(S) equivalent of the remote URL
 */
export const convertToHttpUrl = (remoteUrl: string): string => {
  // Handle SSH format (git@gitlab.com:user/repo.git)
  if (remoteUrl.startsWith('git@')) {
    const match = remoteUrl.match(/git@([^:]+):(.+)/);
    if (match) {
      const [, domain, path] = match;
      return `https://${domain}/${path}`;
    }
  }

  // Handle git:// protocol
  if (remoteUrl.startsWith('git://')) {
    return remoteUrl.replace('git://', 'https://');
  }

  // Handle SSH with explicit protocol (ssh://git@gitlab.com/user/repo.git)
  if (remoteUrl.startsWith('ssh://')) {
    return remoteUrl.replace('ssh://', 'https://').replace(/git@([^/]+)/, '$1');
  }

  // Already HTTP(S) or unknown format - return as-is
  return remoteUrl;
};
