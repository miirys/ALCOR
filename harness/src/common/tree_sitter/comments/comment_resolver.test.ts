import type { Language, Query, QueryCapture, SyntaxNode, Tree } from 'web-tree-sitter';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { TreeSitterLanguageName } from '../languages';
import { CommentResolver, getCommentResolver } from './comment_resolver';

jest.mock('../../log');

describe('CommentResolver', () => {
  let commentResolver: CommentResolver;
  let mockLanguage: Language;
  let mockTree: Tree;
  let mockQuery: Query;

  beforeEach(() => {
    commentResolver = new CommentResolver();
    mockQuery = createFakePartial<Query>({
      captures: jest.fn().mockReturnValue([
        {
          node: {
            startPosition: { row: 0, column: 0 },
            endPosition: { row: 0, column: 10 },
            text: '// Comment',
          },
        },
      ]),
    });
    mockLanguage = createFakePartial<Language>({
      query: jest.fn().mockReturnValue(mockQuery),
    });
    mockTree = createFakePartial<Tree>({
      rootNode: createFakePartial<SyntaxNode>({
        startPosition: { row: 0, column: 0 },
        endPosition: { row: 10, column: 0 },
      }),
    });
  });

  describe('getCommentForCursor', () => {
    it('should return undefined if no query is found for the language', () => {
      (mockQuery.captures as jest.Mock) = jest.fn().mockReturnValue([]);

      const result = commentResolver.getCommentForCursor({
        languageName: 'unknown' as TreeSitterLanguageName,
        tree: mockTree,
        cursorPosition: { row: 0, column: 0 },
        treeSitterLanguage: mockLanguage,
      });

      expect(result).toBeUndefined();
    });

    it('should return undefined if a non-comment node is between the comment and the cursor', () => {
      const comments = [
        {
          node: {
            startPosition: { row: 0, column: 0 },
            endPosition: { row: 0, column: 10 },
            text: '// Comment',
            parent: {
              startPosition: { row: 0, column: 0 },
              endPosition: { row: 10, column: 0 },
              children: [
                {
                  startPosition: { row: 1, column: 0 },
                  endPosition: { row: 1, column: 10 },
                },
              ],
            },
          },
        } as QueryCapture,
      ];

      (mockQuery.captures as jest.Mock).mockReturnValueOnce(comments);

      const result = commentResolver.getCommentForCursor({
        languageName: 'typescript',
        tree: mockTree,
        cursorPosition: { row: 2, column: 0 },
        treeSitterLanguage: mockLanguage,
      });

      expect(result).toBeUndefined();
    });

    it('should return the comment if no non-comment nodes are found', () => {
      const comments = [
        {
          node: {
            startPosition: { row: 0, column: 0 },
            endPosition: { row: 0, column: 10 },
            text: '// Comment',
            parent: {
              startPosition: { row: 0, column: 0 },
              endPosition: { row: 10, column: 0 },
              children: [
                {
                  startPosition: { row: 5, column: 0 },
                  endPosition: { row: 5, column: 10 },
                },
              ],
            },
          },
        } as QueryCapture,
      ];

      (mockQuery.captures as jest.Mock).mockReturnValueOnce(comments);

      const result = commentResolver.getCommentForCursor({
        languageName: 'typescript',
        tree: mockTree,
        cursorPosition: { row: 2, column: 0 },
        treeSitterLanguage: mockLanguage,
      });

      expect(result).toEqual({
        commentAboveCursor: {
          start: { row: 0, column: 0 },
          end: { row: 0, column: 10 },
          content: '// Comment',
          capture: comments[0],
        },
      });
    });

    it('should return the comment when cursor is within a comment', () => {
      const comments = [
        createFakePartial<QueryCapture>({
          name: 'comment',
          node: createFakePartial<SyntaxNode>({
            startPosition: { row: 1, column: 0 },
            endPosition: { row: 1, column: 10 },
            text: '// Comment',
            parent: createFakePartial<SyntaxNode>({
              startPosition: { row: 0, column: 0 },
              endPosition: { row: 2, column: 0 },
            }),
          }),
        }),
      ];

      (mockQuery.captures as jest.Mock).mockReturnValueOnce(comments);

      const result = commentResolver.getCommentForCursor({
        languageName: 'typescript',
        tree: mockTree,
        cursorPosition: { row: 1, column: 5 },
        treeSitterLanguage: mockLanguage,
      });

      expect(result).toEqual({
        commentAtCursor: {
          start: { row: 1, column: 0 },
          end: { row: 1, column: 10 },
          content: '// Comment',
          capture: comments[0],
        },
      });
    });

    it('should return the comment when cursor is within a block comment', () => {
      const comments = [
        createFakePartial<QueryCapture>({
          name: 'comment',
          node: createFakePartial<SyntaxNode>({
            startPosition: { row: 6, column: 0 },
            endPosition: { row: 9, column: 2 },
            text: '/*\nThis is a block comment\nIt spans multiple lines\n*/',
          }),
        }),
      ];

      (mockQuery.captures as jest.Mock).mockReturnValueOnce(comments);

      const result = commentResolver.getCommentForCursor({
        languageName: 'typescript',
        tree: mockTree,
        cursorPosition: { row: 7, column: 22 },
        treeSitterLanguage: mockLanguage,
      });

      expect(result).toEqual({
        commentAtCursor: {
          start: { row: 6, column: 0 },
          end: { row: 9, column: 2 },
          content: '/*\nThis is a block comment\nIt spans multiple lines\n*/',
          capture: comments[0],
        },
      });
    });

    it('should return the comment closest to the cursor when multiple comments exist', () => {
      const comments = [
        createFakePartial<QueryCapture>({
          name: 'comment',
          node: createFakePartial<SyntaxNode>({
            startPosition: { row: 1, column: 0 },
            endPosition: { row: 1, column: 10 },
            text: '// Comment1',
            parent: createFakePartial<SyntaxNode>({
              startPosition: { row: 0, column: 0 },
              endPosition: { row: 5, column: 0 },
              children: [],
            }),
          }),
        }),
        createFakePartial<QueryCapture>({
          name: 'comment',
          node: createFakePartial<SyntaxNode>({
            startPosition: { row: 3, column: 0 },
            endPosition: { row: 3, column: 10 },
            text: '// Comment2',
            parent: createFakePartial<SyntaxNode>({
              startPosition: { row: 0, column: 0 },
              endPosition: { row: 5, column: 0 },
              children: [],
            }),
          }),
        }),
      ];

      (mockQuery.captures as jest.Mock).mockReturnValueOnce(comments);

      const result = commentResolver.getCommentForCursor({
        languageName: 'typescript',
        tree: mockTree,
        cursorPosition: { row: 2, column: 0 },
        treeSitterLanguage: mockLanguage,
      });

      expect(result).toEqual({
        commentAboveCursor: {
          start: { row: 1, column: 0 },
          end: { row: 1, column: 10 },
          content: '// Comment1',
          capture: comments[0],
        },
      });
    });
  });

  describe('getTotalCommentLines', () => {
    const getResult = (languageName: TreeSitterLanguageName = 'typescript') =>
      commentResolver.getTotalCommentLines({
        languageName,
        tree: mockTree,
        treeSitterLanguage: mockLanguage,
      });

    it('should return 0 if no query is found for the language', () => {
      mockQuery.captures = jest.fn().mockReturnValueOnce([]);
      const unknownLanguage = 'unknown' as TreeSitterLanguageName;

      expect(getResult(unknownLanguage)).toBe(0);
    });

    it('should return 0 if no comments were found', () => {
      jest.mocked(mockQuery.captures).mockReturnValueOnce([]);

      expect(getResult()).toBe(0);
    });

    it('should return the total number of comment lines', () => {
      const captures = [
        {
          node: {
            startPosition: { row: 0, column: 0 },
            endPosition: { row: 0, column: 12 },
            text: '// Comment 1',
          },
        },
        {
          node: {
            startPosition: { row: 1, column: 0 },
            endPosition: { row: 1, column: 12 },
            text: '// Comment 2',
          },
        },
        {
          node: {
            startPosition: { row: 2, column: 0 },
            endPosition: { row: 2, column: 12 },
            text: '// Comment 3',
          },
        },
      ];

      (mockQuery.captures as jest.Mock as jest.Mock).mockReturnValueOnce(captures);

      expect(getResult()).toBe(3);
    });

    it('should not count the same row twice if a comment spans over multiple lines', () => {
      const captures = [
        { node: { startPosition: { row: 0, column: 0 }, endPosition: { row: 4, column: 3 } } },
        { node: { startPosition: { row: 0, column: 0 }, endPosition: { row: 4, column: 3 } } },
        { node: { startPosition: { row: 0, column: 0 }, endPosition: { row: 4, column: 3 } } },
      ];

      (mockQuery.captures as jest.Mock as jest.Mock).mockReturnValueOnce(captures);

      expect(getResult()).toBe(5);
    });
  });

  describe('isCommentEmpty', () => {
    it('should return true if the comment is empty', () => {
      const comment = {
        start: { row: 0, column: 0 },
        end: { row: 0, column: 10 },
        content: '//  ',
        capture: {} as QueryCapture,
      };

      const result = CommentResolver.isCommentEmpty(comment);

      expect(result).toBe(true);
    });

    it('should return false if the comment is not empty', () => {
      const comment = {
        start: { row: 0, column: 0 },
        end: { row: 0, column: 10 },
        content: '// Comment',
        capture: {} as QueryCapture,
      };

      const result = CommentResolver.isCommentEmpty(comment);

      expect(result).toBe(false);
    });
  });

  describe('getCommentResolver', () => {
    it('should return a singleton instance of CommentResolver', () => {
      const resolver1 = getCommentResolver();
      const resolver2 = getCommentResolver();

      expect(resolver1).toBe(resolver2);
      expect(resolver1).toBeInstanceOf(CommentResolver);
    });
  });
});
