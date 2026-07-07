import { ActiveFileContext } from '../chat/gitlab_chat_record_context';

export function trimActiveFileContext(activeFileContext: ActiveFileContext) {
  const MAX_CONTENT_LENGTH = 400000;

  const workingContext = { ...activeFileContext };
  if (
    (!workingContext.contentAboveCursor || workingContext.contentAboveCursor === '') &&
    (!workingContext.contentBelowCursor || workingContext.contentBelowCursor === '')
  ) {
    return workingContext;
  }

  const totalLength =
    (workingContext.contentAboveCursor?.length || 0) +
    (workingContext.contentBelowCursor?.length || 0);

  if (totalLength <= MAX_CONTENT_LENGTH) {
    return workingContext;
  }

  if (workingContext.contentAboveCursor && workingContext.contentBelowCursor) {
    const percentageLengthAbove = workingContext.contentAboveCursor.length / totalLength;
    const maxAboveLength = Math.floor(percentageLengthAbove * MAX_CONTENT_LENGTH);
    const maxBelowLength = MAX_CONTENT_LENGTH - maxAboveLength;

    workingContext.contentAboveCursor = workingContext.contentAboveCursor.slice(-maxAboveLength);
    workingContext.contentBelowCursor = workingContext.contentBelowCursor.slice(0, maxBelowLength);
  } else if (
    workingContext.contentAboveCursor &&
    workingContext.contentAboveCursor.length > MAX_CONTENT_LENGTH
  ) {
    workingContext.contentAboveCursor =
      workingContext.contentAboveCursor.slice(-MAX_CONTENT_LENGTH);
  } else if (
    workingContext.contentBelowCursor &&
    workingContext.contentBelowCursor.length > MAX_CONTENT_LENGTH
  ) {
    workingContext.contentBelowCursor = workingContext.contentBelowCursor.slice(
      0,
      MAX_CONTENT_LENGTH,
    );
  }

  return workingContext;
}
