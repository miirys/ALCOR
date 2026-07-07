// TODO: move the remaining ClientConfig types into this package:
// https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/1005

export interface IHttpAgentOptions {
  ca?: string;
  cert?: string;
  certKey?: string;
}

export interface IKnowledgeGraphConfig {
  binaryPath?: string;
}
