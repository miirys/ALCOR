import type { Language, Query, QueryCapture, SyntaxNode, Tree } from 'web-tree-sitter';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { TreeSitterLanguageName } from '../languages';
import { EmptyFunctionResolver, getEmptyFunctionResolver } from './empty_function_resolver';

jest.mock('../../log');

describe('EmptyFunctionResolver', () => {
  let emptyFunctionResolver: EmptyFunctionResolver;
  let mockLanguage: Language;
  let mockTree: Tree;
  let mockQuery: Query;
  const childForFieldName = jest.fn();

  beforeEach(() => {
    emptyFunctionResolver = new EmptyFunctionResolver();
    mockQuery = createFakePartial<Query>({
      captures: jest.fn().mockReturnValue([
        {
          node: {
            startPosition: { row: 0, column: 0 },
            endPosition: { row: 0, column: 10 },
            childForFieldName,
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

  describe('isCursorInEmptyFunction', () => {
    it('should return false if no query is found for the language', () => {
      (mockQuery.captures as jest.Mock) = jest.fn().mockReturnValue([]);

      const result = emptyFunctionResolver.isCursorInEmptyFunction({
        languageName: 'unknown' as TreeSitterLanguageName,
        tree: mockTree,
        cursorPosition: { row: 0, column: 0 },
        treeSitterLanguage: mockLanguage,
      });

      expect(result).toBe(false);
    });

    it('should return true if cursor is inside the empty function body boundaries', () => {
      (mockQuery.captures as jest.Mock as jest.Mock).mockReturnValueOnce([
        {
          node: {
            startPosition: { row: 0, column: 8 },
            endPosition: { row: 0, column: 10 },
            text: '{ }',
            parent: {
              startPosition: { row: 0, column: 0 },
              endPosition: { row: 0, column: 10 },
            },
            lastChild: {
              startPosition: { row: 0, column: 9 },
              endPosition: { row: 0, column: 10 },
              text: '}',
              previousSibling: {
                startPosition: { row: 0, column: 8 },
                endPosition: { row: 0, column: 9 },
                text: '{',
              },
            },
          },
        } as QueryCapture,
      ]);

      const result = emptyFunctionResolver.isCursorInEmptyFunction({
        languageName: 'typescript',
        tree: mockTree,
        cursorPosition: { row: 0, column: 9 },
        treeSitterLanguage: mockLanguage,
      });

      expect(result).toBe(true);
    });

    it('should return false if cursor is not inside the empty function body boundaries', () => {
      (mockQuery.captures as jest.Mock as jest.Mock).mockReturnValueOnce([
        {
          node: {
            startPosition: { row: 0, column: 8 },
            endPosition: { row: 0, column: 10 },
            text: '{ }',
            parent: {
              startPosition: { row: 0, column: 0 },
              endPosition: { row: 0, column: 10 },
            },
            lastChild: {
              startPosition: { row: 0, column: 9 },
              endPosition: { row: 0, column: 10 },
              text: '}',
              previousSibling: {
                startPosition: { row: 0, column: 8 },
                endPosition: { row: 0, column: 9 },
                text: '{',
              },
            },
          },
        } as QueryCapture,
      ]);

      const result = emptyFunctionResolver.isCursorInEmptyFunction({
        languageName: 'typescript',
        tree: mockTree,
        cursorPosition: { row: 0, column: 11 },
        treeSitterLanguage: mockLanguage,
      });

      expect(result).toBe(false);
    });

    it('should return true if cursor is after empty Python function', () => {
      childForFieldName.mockReturnValue({
        childCount: 0,
      });

      const result = emptyFunctionResolver.isCursorInEmptyFunction({
        languageName: 'python',
        tree: mockTree,
        cursorPosition: { row: 1, column: 0 },
        treeSitterLanguage: mockLanguage,
      });

      expect(result).toBe(true);
    });
  });

  describe('getEmptyFunctionResolver', () => {
    it('should return a singleton instance of EmptyFunctionResolver', () => {
      const resolver1 = getEmptyFunctionResolver();
      const resolver2 = getEmptyFunctionResolver();

      expect(resolver1).toBe(resolver2);
      expect(resolver1).toBeInstanceOf(EmptyFunctionResolver);
    });
  });
});
