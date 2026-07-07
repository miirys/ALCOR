import { DocumentUri, InlineCompletionContext, WorkspaceFolder } from 'vscode-languageserver';
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { IDocContext, IDocTransformer } from '@gitlab-org/document';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import { LsTextDocuments } from '@gitlab-org/core';
import { sanitizeRange } from './utils/sanitize_range';
import { getRelativePath, getFileExtensionByLanguageId, fileNeedsExtension } from './utils/path';
import { log } from './log';

// Re-export for backward compatibility
export { IDocContext, type IDocTransformer } from '@gitlab-org/document';

const getMatchingWorkspaceFolder = (
  fileUri: DocumentUri,
  workspaceFolders: WorkspaceFolder[],
): WorkspaceFolder | undefined => workspaceFolders.find((wf) => fileUri.startsWith(wf.uri));

export interface DocumentTransformerService {
  get(uri: string): TextDocument | undefined;
  getContext(
    uri: string,
    position: Position,
    workspaceFolders: WorkspaceFolder[],
    completionContext?: InlineCompletionContext,
  ): IDocContext | undefined;
  transform(context: IDocContext): IDocContext;
}

export const DocumentTransformerService = createInterfaceId<DocumentTransformerService>(
  'DocumentTransformerService',
);
@Injectable(DocumentTransformerService, [LsTextDocuments, SecretRedactor])
export class DefaultDocumentTransformerService implements DocumentTransformerService {
  #transformers: IDocTransformer[] = [];

  #documents: LsTextDocuments;

  constructor(documents: LsTextDocuments, secretRedactor: SecretRedactor) {
    this.#documents = documents;
    this.#transformers.push(secretRedactor);
  }

  get(uri: string) {
    return this.#documents.get(uri);
  }

  getContext(
    uri: string,
    position: Position,
    workspaceFolders: WorkspaceFolder[],
    completionContext?: InlineCompletionContext,
  ): IDocContext | undefined {
    const doc = this.get(uri);
    if (doc === undefined) {
      return undefined;
    }
    return this.transform(getDocContext(doc, position, workspaceFolders, completionContext));
  }

  transform(context: IDocContext): IDocContext {
    return this.#transformers.reduce((ctx, transformer) => transformer.transform(ctx), context);
  }
}

export function getDocContext(
  document: TextDocument,
  position: Position,
  workspaceFolders: WorkspaceFolder[],
  completionContext?: InlineCompletionContext,
): IDocContext {
  let prefix: string;

  if (completionContext?.selectedCompletionInfo) {
    const { selectedCompletionInfo } = completionContext;
    const range = sanitizeRange(selectedCompletionInfo.range);

    prefix = `${document.getText({
      start: document.positionAt(0),
      end: range.start,
    })}${selectedCompletionInfo.text}`;
  } else {
    prefix = document.getText({ start: document.positionAt(0), end: position });
  }

  const suffix = document.getText({
    start: position,
    end: document.positionAt(document.getText().length),
  });

  const workspaceFolder = getMatchingWorkspaceFolder(document.uri, workspaceFolders);
  if (!workspaceFolder) {
    log.debug(
      `No workspace folder found for ${document.uri}, current workspace folders: ${workspaceFolders.map((wf) => wf.uri).join(', ')}`,
    );
  }
  let fileRelativePath = getRelativePath(document.uri, workspaceFolder);

  if (fileNeedsExtension(fileRelativePath)) {
    fileRelativePath = `${fileRelativePath}${getFileExtensionByLanguageId(document.languageId)}`;
  }

  return {
    prefix,
    suffix,
    fileRelativePath,
    position,
    uri: document.uri,
    languageId: document.languageId,
    workspaceFolder,
  };
}
