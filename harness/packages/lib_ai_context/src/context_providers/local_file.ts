import { WorkspaceFolder } from 'vscode-languageserver';
import type { AIContextItem, AIContextItemMetadata } from '../ai_context_item';

type LocalFileMetadata = AIContextItemMetadata & {
  subType: 'local_file_search';
  relativePath?: string;
  workspaceFolder?: WorkspaceFolder;
  project: string;
};

export type LocalFileAIContextItem = AIContextItem & {
  category: 'file';
  metadata: LocalFileMetadata;
};
