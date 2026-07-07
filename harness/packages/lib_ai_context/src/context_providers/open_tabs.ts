import { TextDocument } from 'vscode-languageserver-textdocument';
import type { WorkspaceFolder } from 'vscode-languageserver';
import type { AIContextItem, AIContextItemMetadata } from '../ai_context_item';

export type OpenTabMetadata = AIContextItemMetadata & {
  subType: 'open_tab';
  iid?: string;
  title?: string;
  relativePath?: string;
  workspaceFolder?: WorkspaceFolder;
  project?: string;
  languageId: TextDocument['languageId'];
  lastAccessed: number;
  lastModified: number;
  byteSize: number;
};

export type OpenTabAIContextItem = AIContextItem & {
  category: 'file';
  metadata: OpenTabMetadata;
};
