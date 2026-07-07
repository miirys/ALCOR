// FIXME: Create package for graphql utils and move GitLabGID there
// https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/652
type GitLabGID = `gid://gitlab/${string}/${string | number}`;

export interface GitLabUser {
  restId: number;
  id: GitLabGID;
  username: string;
  name: string;
  avatarUrl: string;
  duoDefaultNamespacePath?: string;
  /** Numeric ID (as string) of the user's default Duo namespace, parsed from the GID. */
  duoDefaultNamespaceId?: string;
}
