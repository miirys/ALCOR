import { TextDocument } from 'vscode-languageserver-textdocument';
import { InlineCompletionContext } from 'vscode-languageserver-protocol';
import { sanitizeRange } from '../utils/sanitize_range';

/** Check if we are at the end of the line or if the cursor is followed only by allowed characters */
export function isAtOrNearEndOfLine(suffix: string) {
  const match = suffix.match(/\r?\n/);
  const lineSuffix = match ? suffix.substring(0, match.index) : suffix;
  // Remainder of line only contains characters within the allowed set
  // The reasoning for this regex is documented here:
  // https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/-/merge_requests/61#note_1608564289
  const allowedCharactersPastCursorRegExp = /^\s*[)}\]"'`]*\s*[:{;,]?\s*$/;
  return allowedCharactersPastCursorRegExp.test(lineSuffix);
}

/**
 * Returns true when context.selectedCompletionInfo.range property represents a text
 * range in the document that doesn't match the text contained in context.selectedCompletionInfo.text.
 *
 * This scenario may occur in autocomplete dropdown widgets, for example VSCode's IntelliSense.
 * In such a case, it will not display the inline completion so we should not request the suggestion.
 *
 * @param context
 * @param document
 * @returns
 */
export function shouldRejectCompletionWithSelectedCompletionTextMismatch(
  context: InlineCompletionContext,
  document?: TextDocument,
): boolean {
  if (!context.selectedCompletionInfo || !document) {
    return false;
  }

  const currentText = document.getText(sanitizeRange(context.selectedCompletionInfo.range));
  const selectedText = context.selectedCompletionInfo.text;

  return !selectedText.startsWith(currentText);
}
