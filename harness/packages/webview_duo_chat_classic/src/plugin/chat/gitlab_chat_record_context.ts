export type ActiveFileContext = {
  fileName: string;
  selectedText: string;
  contentAboveCursor: string | null;
  contentBelowCursor: string | null;
};

export type GitLabChatRecordContext = {
  currentFile: ActiveFileContext;
};
