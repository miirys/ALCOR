import type { Language, QueryCapture, Tree } from 'web-tree-sitter';
import Parser from 'web-tree-sitter';
import { createFakePartial } from '@gitlab-org/test-utils';
import { CommentResolver } from './comments/comment_resolver';
import {
  EmptyFunctionResolver,
  getEmptyFunctionResolver,
} from './empty_function/empty_function_resolver';
import { getIntent } from './intent_resolver';
import { isSmallFile } from './small_files';

import type { TreeAndLanguage } from './parser';

jest.mock('../log');
jest.mock('./small_files');
jest.mock('./empty_function/empty_function_resolver');

const mockIsCursorInEmptyFunction = jest.fn();
const getMockComment = (isEmpty: boolean) => ({
  content: isEmpty ? '  ' : 'Some non-empty comment',
  capture: {} as QueryCapture,
  end: {
    row: 1,
    column: 1,
  },
  start: {
    row: 1,
    column: 1,
  },
});

describe('getIntent', () => {
  let treeAndLanguage: TreeAndLanguage;

  beforeEach(() => {
    const mockLanguage: Partial<Language> = {
      query: jest.fn().mockReturnValue({ captures: jest.fn().mockReturnValue([]) }),
    };

    treeAndLanguage = {
      tree: createFakePartial<Tree>({}),
      languageInfo: {
        name: 'typescript',
        extensions: ['.ts'],
        wasmPath: 'path/to/wasm',
        nodeModulesPath: 'path/to/node_modules',
        editorLanguageIds: ['typescript'],
      },
      language: createFakePartial<Language>(mockLanguage),
      parser: {} as unknown as Parser,
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('when detecting a comment', () => {
    describe('at the cursor', () => {
      it.each([
        { isCommentEmpty: true, commentType: 'empty' },
        { isCommentEmpty: false, commentType: 'non-empty' },
      ])(
        'should return "completion" intent for an $commentType comment',
        async ({ isCommentEmpty }) => {
          const commentResolution = {
            commentAtCursor: getMockComment(isCommentEmpty),
          };

          jest
            .spyOn(CommentResolver.prototype, 'getCommentForCursor')
            .mockReturnValue(commentResolution);
          jest.spyOn(CommentResolver, 'isCommentEmpty').mockReturnValue(isCommentEmpty);

          const result = await getIntent({
            treeAndLanguage,
            position: { line: 1, character: 0 },
            prefix: 'prefix content',
            suffix: 'suffix content',
          });

          expect(result).toEqual({
            intent: 'completion',
          });
        },
      );
    });

    describe('above the cursor', () => {
      it('should return "completion" intent for an empty comment', async () => {
        const commentResolution = {
          commentAboveCursor: getMockComment(true),
        };

        jest
          .spyOn(CommentResolver.prototype, 'getCommentForCursor')
          .mockReturnValue(commentResolution);
        jest.spyOn(CommentResolver, 'isCommentEmpty').mockReturnValue(true);

        const result = await getIntent({
          treeAndLanguage,
          position: { line: 2, character: 0 },
          prefix: 'prefix content',
          suffix: 'suffix content',
        });

        expect(result).toEqual({
          intent: 'completion',
        });
      });

      it('should return "generation" intent for a non-empty comment', async () => {
        const commentResolution = {
          commentAboveCursor: getMockComment(false),
        };

        jest
          .spyOn(CommentResolver.prototype, 'getCommentForCursor')
          .mockReturnValue(commentResolution);
        jest.spyOn(CommentResolver, 'isCommentEmpty').mockReturnValue(false);

        const result = await getIntent({
          treeAndLanguage,
          position: { line: 2, character: 0 },
          prefix: 'prefix content',
          suffix: 'suffix content',
        });

        expect(result).toEqual({
          intent: 'generation',
          generationType: 'comment',
          commentForCursor: commentResolution.commentAboveCursor,
        });
      });
    });
  });

  it('should return generation intent when a small file is detected', async () => {
    const totalComments = 2;
    const prefix = 'line_1 \n line_2 \n // line_3';
    const suffix = 'line_4 \n line_5 \n // line_6';
    const textContent = `${prefix}${suffix}`;

    jest.spyOn(CommentResolver.prototype, 'getTotalCommentLines').mockReturnValue(totalComments);
    jest.mocked(isSmallFile).mockReturnValueOnce(true);

    const result = await getIntent({
      treeAndLanguage,
      position: { line: 2, character: 0 },
      prefix,
      suffix,
    });

    expect(isSmallFile).toHaveBeenCalledWith(textContent, totalComments);
    expect(result).toEqual({ intent: 'generation', generationType: 'small_file' });
  });

  it('should return generation intent when a cursor is inside empty function', async () => {
    const prefix = 'function a() {';
    const suffix = '\n}';

    jest.mocked(getEmptyFunctionResolver).mockReturnValue(
      createFakePartial<EmptyFunctionResolver>({
        isCursorInEmptyFunction: jest.fn().mockReturnValueOnce(true),
      }),
    );

    jest.mocked(mockIsCursorInEmptyFunction).mockReturnValueOnce(true);

    const result = await getIntent({
      treeAndLanguage,
      position: { line: 2, character: 0 },
      prefix,
      suffix,
    });

    expect(result).toEqual({ intent: 'generation', generationType: 'empty_function' });
  });

  it('should return undefined intent when neither small file detected not cursor is after the comment or inside empty function', async () => {
    const prefix = 'line_1 \n line_2 \n line_3';
    const suffix = 'line_4 \n line_5 \n line_6';

    const result = await getIntent({
      treeAndLanguage,
      position: { line: 2, character: 0 },
      prefix,
      suffix,
    });

    expect(result).toEqual({ intent: undefined });
  });
});
