import { createFakePartial } from '@gitlab-org/test-utils';
import { ActiveFileContext } from '../chat/gitlab_chat_record_context';
import { trimActiveFileContext } from './trim_active_file_context';

const activeFileContext = createFakePartial<ActiveFileContext>({
  fileName: 'foo',
  selectedText: 'bar',
});
const MAX_CONTENT_LENGTH = 400000;

describe('#trimActiveFileContext', () => {
  describe('when no content exists', () => {
    it('should return unchanged when both contentAboveCursor and contentBelowCursor are null', () => {
      const context: ActiveFileContext = {
        ...activeFileContext,
        contentAboveCursor: null,
        contentBelowCursor: null,
      };

      const result = trimActiveFileContext(context);

      expect(result).toEqual(context);
      expect(result).not.toBe(context);
    });

    it('should return unchanged when both contentAboveCursor and contentBelowCursor are empty strings', () => {
      const context: ActiveFileContext = {
        ...activeFileContext,
        contentAboveCursor: '',
        contentBelowCursor: '',
      };

      const result = trimActiveFileContext(context);

      expect(result).toEqual(context);
    });

    it('should return unchanged when one is null and other is empty', () => {
      const context: ActiveFileContext = {
        ...activeFileContext,
        contentAboveCursor: null,
        contentBelowCursor: '',
      };

      const result = trimActiveFileContext(context);

      expect(result).toEqual(context);
    });
  });

  describe('when total content is within limit', () => {
    it('should return unchanged when total length is less than MAX_CONTENT_LENGTH', () => {
      const context: ActiveFileContext = {
        ...activeFileContext,
        contentAboveCursor: 'a'.repeat(400),
        contentBelowCursor: 'b'.repeat(500),
      };

      const result = trimActiveFileContext(context);

      expect(result).toEqual(context);
      expect(result.contentAboveCursor).toBe(context.contentAboveCursor);
      expect(result.contentBelowCursor).toBe(context.contentBelowCursor);
    });

    it('should return unchanged when total length equals MAX_CONTENT_LENGTH', () => {
      const equalPositionLength = MAX_CONTENT_LENGTH / 2;

      const context: ActiveFileContext = {
        ...activeFileContext,
        contentAboveCursor: 'a'.repeat(equalPositionLength),
        contentBelowCursor: 'b'.repeat(equalPositionLength),
      };

      const result = trimActiveFileContext(context);

      expect(result).toEqual(context);
    });

    it('should return unchanged when only one content exists and is within limit', () => {
      const context: ActiveFileContext = {
        ...activeFileContext,
        contentAboveCursor: 'a'.repeat(100000),
        contentBelowCursor: null,
      };

      const result = trimActiveFileContext(context);

      expect(result).toEqual(context);
    });
  });

  describe('when combined contentAboveCursor and contentBelowCursor exceed limit', () => {
    it('should trim both contents proportionally', () => {
      const contentAboveCursor = 'a'.repeat(450000); // 75% of 600k
      const contentBelowCursor = 'b'.repeat(150000); // 25% of 600k

      const context: ActiveFileContext = {
        ...activeFileContext,
        contentAboveCursor,
        contentBelowCursor,
      };

      const result = trimActiveFileContext(context);

      const totalLength = 600000;
      const percentageAbove = 450000 / totalLength; // 0.75

      const expectedAboveLength = Math.floor(percentageAbove * MAX_CONTENT_LENGTH);
      const expectedBelowLength = MAX_CONTENT_LENGTH - expectedAboveLength;

      expect(result.contentAboveCursor).toBe(contentAboveCursor.slice(-expectedAboveLength));
      expect(result.contentBelowCursor).toBe(contentBelowCursor.slice(0, expectedBelowLength));
      expect(result.contentAboveCursor!.length + result.contentBelowCursor!.length).toBe(
        MAX_CONTENT_LENGTH,
      );
    });

    it('should maintain proportional distribution with equal content', () => {
      const contentAboveCursor = 'a'.repeat(300000); // 50% of 600k
      const contentBelowCursor = 'b'.repeat(300000); // 50% of 600k

      const context: ActiveFileContext = {
        ...activeFileContext,
        contentAboveCursor,
        contentBelowCursor,
      };

      const result = trimActiveFileContext(context);

      const expectedLength = MAX_CONTENT_LENGTH / 2; // 200000 each

      expect(result.contentAboveCursor).toBe(contentAboveCursor.slice(-expectedLength));
      expect(result.contentBelowCursor).toBe(contentBelowCursor.slice(0, expectedLength));
      expect(result.contentAboveCursor!.length).toBe(expectedLength);
      expect(result.contentBelowCursor!.length).toBe(expectedLength);
    });
  });

  describe('when only contentAboveCursor exceeds limit', () => {
    it('should trim only contentAboveCursor when contentBelowCursor is null', () => {
      const contentAboveCursor = 'a'.repeat(500000);
      const context: ActiveFileContext = {
        ...activeFileContext,
        contentAboveCursor,
        contentBelowCursor: null,
      };

      const result = trimActiveFileContext(context);

      expect(result.contentAboveCursor).toBe(contentAboveCursor.slice(-MAX_CONTENT_LENGTH));
      expect(result.contentBelowCursor).toBe(null);
      expect(result.contentAboveCursor!.length).toBe(MAX_CONTENT_LENGTH);
    });

    it('should trim only contentAboveCursor when contentBelowCursor is empty', () => {
      const contentAboveCursor = 'a'.repeat(500000);

      const context: ActiveFileContext = {
        ...activeFileContext,
        contentAboveCursor,
        contentBelowCursor: '',
      };

      const result = trimActiveFileContext(context);

      expect(result.contentAboveCursor).toBe(contentAboveCursor.slice(-MAX_CONTENT_LENGTH));
      expect(result.contentBelowCursor).toBe('');
      expect(result.contentAboveCursor!.length).toBe(MAX_CONTENT_LENGTH);
    });
  });

  describe('when only contentBelowCursor exceeds limit', () => {
    it('should trim only contentBelowCursor when contentAboveCursor is null', () => {
      const contentBelowCursor = 'b'.repeat(500000);
      const context: ActiveFileContext = {
        ...activeFileContext,
        contentAboveCursor: null,
        contentBelowCursor,
      };

      const result = trimActiveFileContext(context);

      expect(result.contentAboveCursor).toBe(null);
      expect(result.contentBelowCursor).toBe(contentBelowCursor.slice(0, MAX_CONTENT_LENGTH));
      expect(result.contentBelowCursor!.length).toBe(MAX_CONTENT_LENGTH);
    });

    it('should trim only contentBelowCursor when contentAboveCursor is empty', () => {
      const contentBelowCursor = 'b'.repeat(500000);

      const context: ActiveFileContext = {
        ...activeFileContext,
        contentAboveCursor: '',
        contentBelowCursor,
      };

      const result = trimActiveFileContext(context);

      expect(result.contentAboveCursor).toBe('');
      expect(result.contentBelowCursor).toBe(contentBelowCursor.slice(0, MAX_CONTENT_LENGTH));
      expect(result.contentBelowCursor!.length).toBe(MAX_CONTENT_LENGTH);
    });
  });
});
