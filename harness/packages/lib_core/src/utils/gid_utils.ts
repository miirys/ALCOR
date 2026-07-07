export type GitLabGID = `gid://gitlab/${string}/${string | number}`;
export const GID_NAMESPACE_GROUP = 'Group';
export const GID_NAMESPACE_ISSUE = 'Issue';
export const GID_NAMESPACE_MERGE_REQUEST = 'MergeRequest';
export const GID_NAMESPACE_PROJECT = 'Project';

/**
 * Creates a GitLab global ID / GraphQL ID, from a namespace and standalone ID / REST ID
 */
export function toGitLabGid(namespace: string, id: string | number): GitLabGID {
  return `gid://gitlab/${namespace}/${id}` as GitLabGID;
}

/**
 * Try to parse a GitLab global ID / GraphQL ID into the ID part / REST ID
 */
export function tryParseGitLabGid(gid: GitLabGID | string): number | undefined {
  const result = parseInt(gid.replace(/gid:\/\/gitlab\/.*\//g, ''), 10);
  if (!result || Number.isNaN(result)) {
    return undefined;
  }
  return result;
}

/**
 * Try to parse a GitLab global ID / GraphQL ID into a string ID, returning empty string if parsing fails
 */
export function tryParseGitLabGidToString(gid: GitLabGID | string | undefined): string {
  if (!gid) {
    return '';
  }

  return (tryParseGitLabGid(gid) ?? '').toString();
}
