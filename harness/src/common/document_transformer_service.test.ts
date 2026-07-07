import { InlineCompletionContext, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createFakePartial } from '@gitlab-org/test-utils';
import { getDocContext } from '.';

describe('getDocContext', () => {
  let document: TextDocument;
  let completionContext: InlineCompletionContext | undefined;

  const position = {
    line: 18,
    character: 2,
  };

  const workspaceFolders = [
    {
      uri: 'file:///Users/test/projects/LSP',
      name: 'LSP',
    },
    {
      name: 'status-page-private',
      uri: 'file:///Users/test/projects/status-page',
      index: 2,
    },
  ];

  beforeEach(() => {
    completionContext = undefined;
    document = {
      languageId: 'javascript',
      uri: 'file:///Users/test/projects/status-page/scripts/sync_emojis.js',
      version: 42,
      positionAt: jest.fn(),
      getText: jest.fn().mockReturnValue('console.log("hello!")'),
      lineCount: 10,
      offsetAt: jest.fn(),
    };
  });
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('default', () => {
    it('should set the relative path to the file based on Workspace Folders', () => {
      expect(
        getDocContext(document, position, workspaceFolders, completionContext).fileRelativePath,
      ).toBe('scripts/sync_emojis.js');
    });

    it('should only return filename if the document is not in a workspace', () => {
      const uri = 'file:///Users/not-in-a-workspace/folder/test_file_name.js';
      expect(
        getDocContext({ ...document, uri }, position, workspaceFolders, completionContext)
          .fileRelativePath,
      ).toBe('test_file_name.js');
    });

    it('should assume file extension based on `languageId`', () => {
      const uri = 'untitled1';
      expect(
        getDocContext({ ...document, uri }, position, workspaceFolders, completionContext)
          .fileRelativePath,
      ).toBe('untitled1.js');
    });
  });

  describe('when there is selected completion info', () => {
    it('should include the selected completion info in the document context', () => {
      const documentStartPosition: Position = { line: 0, character: 0 };
      const selectedCompletionStartPosition: Position = { line: 17, character: 1 };
      const selectedCompletionEndPosition: Position = { line: 17, character: 1 };

      jest.mocked(document.getText).mockReturnValueOnce('console.');
      jest.mocked(document.positionAt).mockReturnValueOnce(documentStartPosition);

      completionContext = createFakePartial<InlineCompletionContext>({
        selectedCompletionInfo: {
          text: 'log',
          range: {
            ...[selectedCompletionStartPosition, selectedCompletionEndPosition],
            start: selectedCompletionStartPosition,
            end: selectedCompletionEndPosition,
          },
        },
      });

      expect(getDocContext(document, position, workspaceFolders, completionContext).prefix).toBe(
        'console.log',
      );
      expect(document.getText).toHaveBeenCalledWith({
        start: documentStartPosition,
        end: selectedCompletionStartPosition,
      });
    });
  });
});
