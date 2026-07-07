import { TextDocumentIdentifier, TextDocumentPositionParams } from 'vscode-languageserver';
import { Position } from 'vscode-languageserver-textdocument';
import { CodeSuggestionResponse } from '../api';
import { IDocContext } from '..';

export const FILE_INFO: IDocContext = {
  fileRelativePath: 'example.ts',
  prefix: 'const x = 10;',
  suffix: 'console.log(x);',
  position: {
    line: 0,
    character: 13,
  },
  uri: 'file:///example.ts',
  languageId: 'javascript',
};

export const CODE_SUGGESTIONS_RESPONSE: CodeSuggestionResponse = {
  choices: [
    { text: 'choice1', uniqueTrackingId: 'ut1' },
    { text: 'choice2', uniqueTrackingId: 'ut2' },
  ],
  status: 200,
};

export const SHORT_COMPLETION_CONTEXT: IDocContext = {
  prefix: 'abc',
  suffix: 'def',
  fileRelativePath: 'test.js',
  position: {
    line: 0,
    character: 3,
  },
  uri: 'file:///example.ts',
  languageId: 'typescript',
};

export const LONG_COMPLETION_CONTEXT: IDocContext = {
  prefix: 'abc 123',
  suffix: 'def 456',
  fileRelativePath: 'test.js',
  position: {
    line: 0,
    character: 7,
  },
  uri: 'file:///example.ts',
  languageId: 'typescript',
};

export const CONTEXT_WITH_WORKSPACE_FOLDER: IDocContext = {
  prefix: 'abc 123',
  suffix: 'def 456',
  fileRelativePath: 'test.js',
  position: {
    line: 0,
    character: 7,
  },
  uri: 'file:///example.ts',
  languageId: 'typescript',
  workspaceFolder: {
    uri: 'file:///workspace',
    name: 'test-workspace',
  },
};

const textDocument: TextDocumentIdentifier = { uri: '/' };
const position: Position = { line: 0, character: 0 };

export const COMPLETION_PARAMS: TextDocumentPositionParams = { textDocument, position };
