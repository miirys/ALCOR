import { resolve } from 'path';
import { cwd } from 'process';
import { readFile } from 'fs/promises';
import { Position } from 'vscode-languageserver-protocol';
import { fsPathToUri } from '@gitlab-org/fs';
import { IDocContext } from '../../../common/document_transformer_service';
import { DesktopTreeSitterParser } from '../../../node/tree_sitter/parser';
import { BASE_SUPPORTED_CODE_SUGGESTIONS_LANGUAGES } from '../../../common/suggestion/supported_languages_service';
import { extractScript } from '../../../common/utils/vue_utils';
import { TreeAndLanguage } from '../../../common/tree_sitter';

export type Category = 'intent' | 'imports';

// add any more languages not in base languages (but supported by tree sitter)
export type LanguageServerLanguageId =
  | (typeof BASE_SUPPORTED_CODE_SUGGESTIONS_LANGUAGES)[number]
  | 'yaml';

/**
 * Use this function to get the path of a fixture file.
 * Pulls from the `src/tests/fixtures` directory.
 */
export const getFixturePath = (category: Category, filePath: string) =>
  resolve(cwd(), 'src', 'tests', 'fixtures', category, filePath);

export type TreeAndTestFile = {
  treeAndLanguage: TreeAndLanguage;
  prefix: string;
  suffix: string;
  fullText: string;
  position: Position;
  languageId: LanguageServerLanguageId;
};

/**
 * Use this function to get the test file and tree for a given fixture file
 * to be used for Tree Sitter testing purposes.
 */
export const getTreeAndTestFile = async ({
  fixturePath,
  position,
  languageId,
}: {
  fixturePath: string;
  position: Position;
  languageId: LanguageServerLanguageId;
}): Promise<TreeAndTestFile | undefined> => {
  const parser = new DesktopTreeSitterParser();
  const fullText = await readFile(fixturePath, 'utf8');
  let treeAndLanguage;
  let adjustedPosition;
  if (languageId === 'vue') {
    const scriptResult = extractScript(fullText);
    if (!scriptResult) return undefined;

    const { scriptContent, scriptStartCharacter, scriptStartLine, language } = scriptResult;
    treeAndLanguage = await parser.parseContent(scriptContent, language);

    // Adjust position: map cursor from full Vue file to script content
    adjustedPosition = {
      line: position.line - scriptStartLine,
      character: position.character - scriptStartCharacter,
    };
  }
  const { prefix, suffix } = splitTextFileForPosition(fullText, position);
  const documentContext = {
    uri: fsPathToUri(fixturePath).toString(),
    prefix,
    suffix,
    position: adjustedPosition || position,
    languageId,
    fileRelativePath: resolve(cwd(), fixturePath),
    workspaceFolder: {
      uri: 'file:///',
      name: 'test',
    },
  } satisfies IDocContext;
  treeAndLanguage = treeAndLanguage || (await parser.parseFile(documentContext));
  if (!treeAndLanguage) {
    throw new Error('Failed to parse file');
  }
  return { prefix, suffix, fullText, treeAndLanguage, position, languageId };
};

/**
 * Mimics the "prefix" and "suffix" according
 * to the position in the text file.
 */
const splitTextFileForPosition = (text: string, position: Position) => {
  const lines = text.split('\n');

  // Ensure the position is within bounds
  const maxRow = lines.length - 1;
  const row = Math.min(position.line, maxRow);
  const maxColumn = lines[row]?.length || 0;
  const column = Math.min(position.character, maxColumn);

  // Get the part of the current line before the cursor and after the cursor
  const prefixLine = lines[row].slice(0, column);
  const suffixLine = lines[row].slice(column);

  // Combine lines before the current row for the prefix
  const prefixLines = lines.slice(0, row).concat(prefixLine);
  const prefix = prefixLines.join('\n');

  // Combine lines after the current row for the suffix
  const suffixLines = [suffixLine].concat(lines.slice(row + 1));
  const suffix = suffixLines.join('\n');

  return { prefix, suffix };
};
