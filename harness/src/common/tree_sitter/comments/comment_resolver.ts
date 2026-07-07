import type { Language, Point, Query, QueryCapture, SyntaxNode, Tree } from 'web-tree-sitter';
import { log } from '../../log';
import type { TreeSitterLanguageName } from '../languages';
import { commentQueries } from './comment_queries';

export type Comment = {
  start: Point;
  end: Point;
  content: string;
  capture: QueryCapture;
};

export type CommentResolution =
  | { commentAtCursor: Comment; commentAboveCursor?: never }
  | { commentAtCursor?: never; commentAboveCursor: Comment };

export class CommentResolver {
  protected queryByLanguage: Map<string, Query>;

  constructor() {
    this.queryByLanguage = new Map();
  }

  #getQueryByLanguage(
    language: TreeSitterLanguageName,
    treeSitterLanguage: Language,
  ): Query | undefined {
    const query = this.queryByLanguage.get(language);
    if (query) {
      return query;
    }
    const queryString = commentQueries[language];
    if (!queryString) {
      log.warn(`No comment query found for language: ${language}`);
      return undefined;
    }
    const newQuery = treeSitterLanguage.query(queryString);
    this.queryByLanguage.set(language, newQuery);
    return newQuery;
  }

  /**
   * Returns the comment that is on or directly above the cursor, if it exists.
   * To handle the case the comment may be several new lines above the cursor,
   * we traverse the tree to check if any nodes are between the comment and the cursor.
   */
  getCommentForCursor({
    languageName,
    tree,
    cursorPosition,
    treeSitterLanguage,
  }: {
    languageName: TreeSitterLanguageName;
    tree: Tree;
    treeSitterLanguage: Language;
    cursorPosition: Point;
  }): CommentResolution | undefined {
    const query = this.#getQueryByLanguage(languageName, treeSitterLanguage);
    if (!query) {
      return undefined;
    }
    const comments = query.captures(tree.rootNode).map((capture) => {
      return {
        start: capture.node.startPosition,
        end: capture.node.endPosition,
        content: capture.node.text,
        capture,
      };
    });

    const commentAtCursor = CommentResolver.#getCommentAtCursor(comments, cursorPosition);
    if (commentAtCursor) {
      // No need to further check for isPositionInNode etc. as cursor is directly on the comment
      return { commentAtCursor };
    }

    const commentAboveCursor = CommentResolver.#getCommentAboveCursor(comments, cursorPosition);
    if (!commentAboveCursor) {
      return undefined;
    }

    const commentParentNode = commentAboveCursor.capture.node.parent;
    if (!commentParentNode) {
      return undefined;
    }

    if (!CommentResolver.#isPositionInNode(cursorPosition, commentParentNode)) {
      return undefined;
    }

    const directChildren = commentParentNode.children;
    for (const child of directChildren) {
      const hasNodeBetweenCursorAndComment =
        child.startPosition.row > commentAboveCursor.capture.node.endPosition.row &&
        child.startPosition.row <= cursorPosition.row;
      if (hasNodeBetweenCursorAndComment) {
        return undefined;
      }
    }
    return { commentAboveCursor };
  }

  static #isPositionInNode(position: Point, node: SyntaxNode): boolean {
    return position.row >= node.startPosition.row && position.row <= node.endPosition.row;
  }

  static #getCommentAboveCursor(comments: Comment[], cursorPosition: Point): Comment | undefined {
    return CommentResolver.#getLastComment(
      comments.filter((comment) => comment.end.row < cursorPosition.row),
    );
  }

  static #getCommentAtCursor(comments: Comment[], cursorPosition: Point): Comment | undefined {
    return CommentResolver.#getLastComment(
      comments.filter(
        (comment) =>
          comment.start.row <= cursorPosition.row && comment.end.row >= cursorPosition.row,
      ),
    );
  }

  static #getLastComment(comments: Comment[]): Comment | undefined {
    return comments.sort((a, b) => b.end.row - a.end.row)[0];
  }

  /**
   * Returns the total number of lines that are comments in a parsed syntax tree.
   * Uses a Set because we only want to count each line once.
   * @param {Object} params - Parameters for counting comment lines.
   * @param {TreeSitterLanguageName} params.languageName - The name of the programming language.
   * @param {Tree} params.tree - The syntax tree to analyze.
   * @param {Language} params.treeSitterLanguage - The Tree-sitter language instance.
   * @returns {number} - The total number of unique lines containing comments.
   */
  getTotalCommentLines({
    treeSitterLanguage,
    languageName,
    tree,
  }: {
    languageName: TreeSitterLanguageName;
    treeSitterLanguage: Language;
    tree: Tree;
  }): number {
    const query = this.#getQueryByLanguage(languageName, treeSitterLanguage);
    const captures = query ? query.captures(tree.rootNode) : []; // Note: in future, we could potentially reuse captures from getCommentForCursor()
    const commentLineSet = new Set<number>(); // A Set is used to only count each line once (the same comment can span multiple lines)

    captures.forEach((capture) => {
      const { startPosition, endPosition } = capture.node;

      for (let { row } = startPosition; row <= endPosition.row; row++) {
        commentLineSet.add(row);
      }
    });

    return commentLineSet.size;
  }

  static isCommentEmpty(comment: Comment): boolean {
    const trimmedContent = comment.content.trim().replace(/[\n\r\\]/g, ' ');

    // Count the number of alphanumeric characters in the trimmed content
    const alphanumericCount = (trimmedContent.match(/[a-zA-Z0-9]/g) || []).length;

    return alphanumericCount <= 2;
  }
}

let commentResolver: CommentResolver;
export function getCommentResolver(): CommentResolver {
  if (!commentResolver) {
    commentResolver = new CommentResolver();
  }
  return commentResolver;
}
