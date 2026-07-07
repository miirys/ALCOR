import type { Language, Point, Query, SyntaxNode, Tree } from 'web-tree-sitter';
import { isUndefined } from 'lodash';
import { log } from '../../log';
import type { TreeSitterLanguageName } from '../languages';
import { emptyFunctionQueries } from './empty_function_queries';

export class EmptyFunctionResolver {
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
    const queryString = emptyFunctionQueries[language];

    if (!queryString) {
      log.warn(`No empty function query found for: ${language}`);
      return undefined;
    }
    const newQuery = treeSitterLanguage.query(queryString);
    this.queryByLanguage.set(language, newQuery);
    return newQuery;
  }

  /**
   * Returns the comment that is directly above the cursor, if it exists.
   * To handle the case the comment may be several new lines above the cursor,
   * we traverse the tree to check if any nodes are between the comment and the cursor.
   */
  isCursorInEmptyFunction({
    languageName,
    tree,
    cursorPosition,
    treeSitterLanguage,
  }: {
    languageName: TreeSitterLanguageName;
    tree: Tree;
    treeSitterLanguage: Language;
    cursorPosition: Point;
  }): boolean {
    const query = this.#getQueryByLanguage(languageName, treeSitterLanguage);

    if (!query) {
      return false;
    }

    const emptyBodyPositions = query.captures(tree.rootNode).map((capture) => {
      return EmptyFunctionResolver.#findEmptyBodyPosition(capture.node);
    });

    const cursorInsideInOneOfTheCaptures = emptyBodyPositions.some(
      (emptyBody) =>
        EmptyFunctionResolver.#isValidBodyPosition(emptyBody) &&
        EmptyFunctionResolver.#isCursorInsideNode(
          cursorPosition,
          emptyBody.startPosition,
          emptyBody.endPosition,
        ),
    );

    return (
      cursorInsideInOneOfTheCaptures ||
      EmptyFunctionResolver.isCursorAfterEmptyPythonFunction({
        languageName,
        tree,
        treeSitterLanguage,
        cursorPosition,
      })
    );
  }

  static #isCursorInsideNode(
    cursorPosition: Point,
    startPosition: Point,
    endPosition: Point,
  ): boolean {
    const { row: cursorRow, column: cursorColumn } = cursorPosition;

    const isCursorAfterNodeStart =
      cursorRow > startPosition.row ||
      (cursorRow === startPosition.row && cursorColumn >= startPosition.column);
    const isCursorBeforeNodeEnd =
      cursorRow < endPosition.row ||
      (cursorRow === endPosition.row && cursorColumn <= endPosition.column);

    return isCursorAfterNodeStart && isCursorBeforeNodeEnd;
  }

  static #isCursorRightAfterNode(cursorPosition: Point, endPosition: Point): boolean {
    const { row: cursorRow, column: cursorColumn } = cursorPosition;
    const isCursorRightAfterNode =
      cursorRow - endPosition.row === 1 ||
      (cursorRow === endPosition.row && cursorColumn > endPosition.column);

    return isCursorRightAfterNode;
  }

  static #findEmptyBodyPosition(node: SyntaxNode): { startPosition?: Point; endPosition?: Point } {
    const startPosition = node.lastChild?.previousSibling?.endPosition;
    const endPosition = node.lastChild?.startPosition;
    return { startPosition, endPosition };
  }

  static #isValidBodyPosition(arg: {
    startPosition?: Point;
    endPosition?: Point;
  }): arg is { startPosition: Point; endPosition: Point } {
    return !isUndefined(arg.startPosition) && !isUndefined(arg.endPosition);
  }

  static isCursorAfterEmptyPythonFunction({
    languageName,
    tree,
    cursorPosition,
    treeSitterLanguage,
  }: {
    languageName: TreeSitterLanguageName;
    tree: Tree;
    treeSitterLanguage: Language;
    cursorPosition: Point;
  }): boolean {
    if (languageName !== 'python') return false;

    const pythonQuery = treeSitterLanguage.query(`[
    (function_definition)
    (class_definition)
  ] @function`);

    const captures = pythonQuery.captures(tree.rootNode);

    if (captures.length === 0) return false;

    // Check if any function or class body is empty and cursor is after it
    return captures.some((capture) => {
      const bodyNode = capture.node.childForFieldName('body');
      return (
        bodyNode?.childCount === 0 &&
        EmptyFunctionResolver.#isCursorRightAfterNode(cursorPosition, capture.node.endPosition)
      );
    });
  }
}

let emptyFunctionResolver: EmptyFunctionResolver;
export function getEmptyFunctionResolver(): EmptyFunctionResolver {
  if (!emptyFunctionResolver) {
    emptyFunctionResolver = new EmptyFunctionResolver();
  }
  return emptyFunctionResolver;
}
