import type { WorkspaceFolder } from 'vscode-languageserver';
import type { AIContextItem, AIContextItemMetadata } from '../ai_context_item';

export type DependencyLibrary = {
  name: string;
  version: string;
};

type DependencyMetadata = AIContextItemMetadata & {
  subType: 'dependency';
  iid?: string;
  workspaceFolder?: WorkspaceFolder;
  project?: string;
  libs?: DependencyLibrary[];
};

export type DependencyAIContextItem = AIContextItem & {
  category: 'dependency';
  metadata: DependencyMetadata;
};
