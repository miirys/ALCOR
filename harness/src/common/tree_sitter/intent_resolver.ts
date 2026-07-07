import type { Position } from 'vscode-languageserver-protocol';
import { GenerationType } from '../api';
import { log } from '../log';
import { type Comment, CommentResolver, getCommentResolver } from './comments/comment_resolver';
import { isSmallFile } from './small_files';
import type { TreeAndLanguage } from './parser';
import { getEmptyFunctionResolver } from './empty_function/empty_function_resolver';

export type Intent = 'completion' | 'generation' | undefined;

export type IntentResolution = {
  intent: Intent;
  commentForCursor?: Comment;
  generationType?: GenerationType;
};

/**
 * Determines the user intent based on cursor position and context within the file.
 * Intent is determined based on several ordered rules:
 * - Returns 'completion' if the cursor is located on or after an empty comment.
 * - Returns 'generation' if the cursor is located after a non-empty comment.
 * - Returns 'generation' if the cursor is not located after a comment and the file is less than 5 lines.
 * - Returns undefined if neither a comment nor small file is detected.
 */
export async function getIntent({
  treeAndLanguage,
  position,
  prefix,
  suffix,
}: {
  treeAndLanguage: TreeAndLanguage;
  position: Position;
  prefix: string;
  suffix: string;
}): Promise<IntentResolution> {
  const commentResolver = getCommentResolver();
  const emptyFunctionResolver = getEmptyFunctionResolver();
  const cursorPosition = { row: position.line, column: position.character };
  const { languageInfo, tree, language: treeSitterLanguage } = treeAndLanguage;
  const commentResolution = commentResolver.getCommentForCursor({
    languageName: languageInfo.name,
    tree,
    cursorPosition,
    treeSitterLanguage,
  });

  if (commentResolution) {
    const { commentAtCursor, commentAboveCursor } = commentResolution;

    if (commentAtCursor) {
      log.debug('IntentResolver: Cursor is directly on a comment, sending intent: completion');
      return { intent: 'completion' };
    }

    const isCommentEmpty = CommentResolver.isCommentEmpty(commentAboveCursor);
    if (isCommentEmpty) {
      log.debug('IntentResolver: Cursor is after an empty comment, sending intent: completion');
      return { intent: 'completion' };
    }

    log.debug('IntentResolver: Cursor is after a non-empty comment, sending intent: generation');
    return {
      intent: 'generation',
      generationType: 'comment',
      commentForCursor: commentAboveCursor,
    };
  }

  const textContent = `${prefix}${suffix}`;

  const totalCommentLines = commentResolver.getTotalCommentLines({
    languageName: languageInfo.name,
    treeSitterLanguage,
    tree,
  });

  if (isSmallFile(textContent, totalCommentLines)) {
    log.debug('IntentResolver: Small file detected, sending intent: generation');
    return { intent: 'generation', generationType: 'small_file' };
  }

  const isCursorInEmptyFunction = emptyFunctionResolver.isCursorInEmptyFunction({
    languageName: languageInfo.name,
    tree,
    cursorPosition,
    treeSitterLanguage,
  });

  if (isCursorInEmptyFunction) {
    log.debug('IntentResolver: Cursor is in an empty function, sending intent: generation');
    return { intent: 'generation', generationType: 'empty_function' };
  }

  log.debug(
    'IntentResolver: Cursor is neither at the end of non-empty comment, nor in a small file, nor in empty function - not sending intent.',
  );
  return { intent: undefined };
}
