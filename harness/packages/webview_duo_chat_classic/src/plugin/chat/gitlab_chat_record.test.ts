import { ChatContextManager } from '@gitlab-org/ai-context';
import { createFakePartial } from '@gitlab-org/test-utils';
import { trimActiveFileContext } from '../utils/trim_active_file_context';
import { GitLabChatRecord } from './gitlab_chat_record';
import { ActiveFileContext, GitLabChatRecordContext } from './gitlab_chat_record_context';

jest.mock('../utils/trim_active_file_context');
const mockTrimActiveFileContext = trimActiveFileContext as jest.MockedFunction<
  typeof trimActiveFileContext
>;

const activeFileContext = createFakePartial<ActiveFileContext>({
  fileName: 'foo',
  selectedText: 'bar',
});
const currentContextMock = createFakePartial<GitLabChatRecordContext>({
  currentFile: activeFileContext,
});

describe('GitLabChatRecord', () => {
  let record: GitLabChatRecord;
  let mockChatContextManager: ChatContextManager;

  beforeEach(() => {
    mockChatContextManager = createFakePartial<ChatContextManager>({});
  });

  it('has meaningful defaults', () => {
    record = new GitLabChatRecord({ role: 'user', content: '' });
    expect(record.type).toBe('general');
    expect(record.state).toBe('ready');
  });

  it('respects provided values over defaults', () => {
    record = new GitLabChatRecord({
      chunkId: 1,
      role: 'user',
      content: '',
      type: 'explainCode',
      requestId: '123',
      state: 'pending',
    });
    expect(record.chunkId).toBe(1);
    expect(record.type).toBe('explainCode');
    expect(record.state).toBe('pending');
    expect(record.requestId).toBe('123');
  });

  it('assigns unique id', () => {
    record = new GitLabChatRecord({ role: 'user', content: '' });
    const anotherRecord = new GitLabChatRecord({ role: 'user', content: '' });

    expect(record.id).not.toEqual(anotherRecord.id);
    expect(record.id.length).toBe(36);
  });

  describe('buildWithContext', () => {
    beforeEach(() => {
      mockChatContextManager = createFakePartial<ChatContextManager>({});
    });

    it('assigns current file context to the record', async () => {
      mockTrimActiveFileContext.mockReturnValue(activeFileContext);

      record = await GitLabChatRecord.buildWithContext(
        { role: 'user', content: '', activeFileContext },
        mockChatContextManager,
      );

      expect(record.context).toStrictEqual(currentContextMock);
    });

    it('should trim content when it exceeds the context limit', async () => {
      const mockActiveFileContext = createFakePartial<ActiveFileContext>({
        fileName: 'test.ts',
        contentAboveCursor: 'a'.repeat(500000),
        contentBelowCursor: 'b'.repeat(100000),
      });

      // Trimmed to MAX_CONTENT_LENGTH (400000)
      // and return only the last 300000 for contentAboveCursor
      // and the first 100000 for contentBelowCursor
      const mockTrimmedFileContext = createFakePartial<ActiveFileContext>({
        fileName: 'test.ts',
        contentAboveCursor: 'a'.repeat(300000),
        contentBelowCursor: 'b'.repeat(100000),
      });

      mockTrimActiveFileContext.mockReturnValue(mockTrimmedFileContext);

      record = await GitLabChatRecord.buildWithContext(
        { role: 'user', content: '', activeFileContext: mockActiveFileContext },
        mockChatContextManager,
      );

      expect(mockTrimActiveFileContext).toHaveBeenCalledWith(mockActiveFileContext);
      expect(record.context).toEqual({
        currentFile: mockTrimmedFileContext,
      });
    });

    it('should not trim content when below the context limit', async () => {
      const mockActiveFileContext = createFakePartial<ActiveFileContext>({
        fileName: 'test.ts',
        contentAboveCursor: 'console.log("test")',
        contentBelowCursor: '',
      });

      const mockUntrimmedFileContext = createFakePartial<ActiveFileContext>({
        fileName: 'test.ts',
        contentAboveCursor: 'console.log("test")',
        contentBelowCursor: '',
      });

      mockTrimActiveFileContext.mockReturnValue(mockActiveFileContext);

      record = await GitLabChatRecord.buildWithContext(
        { role: 'user', content: '', activeFileContext: mockActiveFileContext },
        mockChatContextManager,
      );

      expect(mockTrimActiveFileContext).toHaveBeenCalledWith(mockActiveFileContext);
      expect(record.context).toEqual({
        currentFile: mockUntrimmedFileContext,
      });
    });

    it('should not trim content when it equals the context limit', async () => {
      const mockActiveFileContext = createFakePartial<ActiveFileContext>({
        fileName: 'test.ts',
        contentAboveCursor: 'a'.repeat(200000),
        contentBelowCursor: 'b'.repeat(200000),
      });

      const mockUntrimmedFileContext = createFakePartial<ActiveFileContext>({
        fileName: 'test.ts',
        contentAboveCursor: 'a'.repeat(200000),
        contentBelowCursor: 'b'.repeat(200000),
      });

      mockTrimActiveFileContext.mockReturnValue(mockActiveFileContext);

      record = await GitLabChatRecord.buildWithContext(
        { role: 'user', content: '', activeFileContext: mockActiveFileContext },
        mockChatContextManager,
      );

      expect(mockTrimActiveFileContext).toHaveBeenCalledWith(mockActiveFileContext);
      expect(record.context).toEqual({
        currentFile: mockUntrimmedFileContext,
      });
    });
  });
});
