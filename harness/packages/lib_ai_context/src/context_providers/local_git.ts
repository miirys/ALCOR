import type { WorkspaceFolder } from 'vscode-languageserver-protocol';
import type { AIContextItem, AIContextItemMetadata } from '../ai_context_item';

export type LocalGitContextMetadata = AIContextItemMetadata & {
  subType: 'local_git';
  repositoryUri: string;
  repositoryName: string;
  workspaceFolder: WorkspaceFolder;
  selectedBranch: string | undefined;
  gitType: 'diff';
};

export type GitContextItem = AIContextItem & {
  category: 'local_git';
  metadata: LocalGitContextMetadata;
};
