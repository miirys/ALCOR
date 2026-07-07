import { DocumentUri, WorkspaceFolder } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { COMMON_TREE_SITTER_LANGUAGES } from '../tree_sitter/languages';

export const fileNeedsExtension = (fileName: string): boolean => {
  return !/\.[^/.]+$/.test(fileName);
};

export const getRelativePath = (
  fileUri: DocumentUri,
  workspaceFolder?: WorkspaceFolder,
): string => {
  if (!workspaceFolder) {
    // splitting a string will produce at least one item and so the pop can't return undefined
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return fileUri.split(/[\\/]/).pop()!;
  }
  return fileUri.slice(workspaceFolder.uri.length).replace(/^\//, '');
};

export const getFileExtensionByLanguageId = (languageId: TextDocument['languageId']): string => {
  for (const lang of COMMON_TREE_SITTER_LANGUAGES) {
    const index = lang.editorLanguageIds.indexOf(languageId);
    if (index !== -1) {
      return lang.extensions[index] || lang.extensions[0];
    }
  }
  return '';
};
