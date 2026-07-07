/* eslint-disable max-classes-per-file */
import { z } from 'zod';
import { TextEdit } from 'vscode-languageserver-protocol';
import { FileAccessService, LSP_PRIORITY } from '@gitlab-org/fs';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { Injectable } from '@gitlab/needle';
import { RpcMessageSender } from '@gitlab-org/rpc-client';
import {
  declareRequest,
  RpcMessageDefinition,
  RpcMessageDefinitionSource,
  ServerToClientRpcMessageDefinitionSource,
} from '@gitlab-org/rpc';
import { DocumentService } from '../document_service';

const position = z.object({ line: z.number(), character: z.number() });
const range = z.object({ start: position, end: position });
const ApplyWorkspaceEditParams = z.object({
  edit: z.object({
    documentChanges: z.array(
      z.object({
        textDocument: z.object({ uri: z.string(), version: z.nullable(z.number()) }),
        edits: z.array(z.object({ range, newText: z.string() })),
      }),
    ),
  }),
});

const ApplyWorkspaceEditResult = z.object({
  applied: z.boolean(),
  failureReason: z.optional(z.string()),
});

// type defintion is in https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_applyEdit
const ApplyWorkspaceEditRequest = declareRequest('workspace/applyEdit')
  .withParams(ApplyWorkspaceEditParams)
  .withResponse(ApplyWorkspaceEditResult)
  .build();

// 2+ alpha before `:` avoids matching Windows drive letters (C:\).
// `:\/?\/` accepts both `scheme://` and `scheme:/` (VS Code omits authority).
const pathOrUriToUri = (pathOrUri: string): string => {
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]+:\/?\//.test(pathOrUri)) {
    return pathOrUri;
  }
  return pathOrUri.replace(/\\/g, '/').replace(/^/, 'file://');
};

@Injectable(FileAccessService, [Logger, RpcMessageSender, DocumentService])
export class LspFileAccessService implements FileAccessService {
  #logger: Logger;

  #sender: RpcMessageSender;

  #documentService: DocumentService;

  constructor(logger: Logger, sender: RpcMessageSender, documentService: DocumentService) {
    this.#logger = withPrefix(logger, '[LspFileAccessService]');
    this.#sender = sender;
    this.#documentService = documentService;
  }

  readonly priority = LSP_PRIORITY;

  async getText(fullPath: string): Promise<string> {
    const document = this.#documentService.getDocument(pathOrUriToUri(fullPath));
    if (!document) {
      throw new Error(`File ${fullPath} is not open in the editor.`);
    }
    return document.getText();
  }

  async writeFile(): Promise<void> {
    // TODO implement in a follow-up https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/1128
    throw new Error(
      'Writing file using LSP is not implemented yet, will fallback to direct FS access',
    );
  }

  async updateFile(fullPath: string, textEdits: TextEdit[]): Promise<void> {
    const uri = pathOrUriToUri(fullPath);

    const editRequest = {
      edit: {
        documentChanges: [
          {
            textDocument: { uri, version: null },
            edits: textEdits,
          },
        ],
      },
    };

    const result = await this.#sender.send(ApplyWorkspaceEditRequest, editRequest);

    if (!result.applied) {
      const errorMessage = result.failureReason ?? 'client failed to apply the file change';
      this.#logger.error(`Error updating file "${fullPath}": ${errorMessage}`);
      throw new Error(`Error updating file: ${errorMessage}`);
    }
  }

  async realPath(): Promise<string> {
    throw new Error(
      'Calculating real path using LSP is not implemented yet, will fallback to direct FS access',
    );
  }
}

@Injectable(ServerToClientRpcMessageDefinitionSource, [])
export class ApplyEditMessageDefinitionSource implements RpcMessageDefinitionSource {
  getMessageDefinitions(): RpcMessageDefinition[] {
    return [ApplyWorkspaceEditRequest];
  }
}
