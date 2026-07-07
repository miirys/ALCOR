export type Eol = '\r\n' | '\n';

/**
 * Detects the dominant end-of-line sequence in the given content.
 *
 * Returns `\r\n` when CRLF line endings are the majority, otherwise `\n`.
 * Files with no line endings (or a tie) default to `\n`.
 *
 * Note: in a mixed-EOL file, callers that use `applyEol` to re-encode strings
 * for matching/writing will normalize toward the detected majority — minority
 * EOLs in the replacement region are silently converted on write.
 */
export function detectEol(content: string): Eol {
  const crlfCount = (content.match(/\r\n/g) ?? []).length;
  // Count standalone `\n` (those not preceded by `\r`).
  const totalLf = (content.match(/\n/g) ?? []).length;
  const lfCount = totalLf - crlfCount;

  return crlfCount > lfCount ? '\r\n' : '\n';
}

/**
 * Normalizes all line endings (`\r\n` and lone `\r`) in the given text to `\n`.
 */
export function normalizeToLf(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Re-encodes text to use the given end-of-line sequence.
 *
 * The input is first normalized to `\n` so the result has consistent line
 * endings regardless of the input's original mix.
 *
 * Use this when matching or writing model-supplied strings against file
 * content: the model frequently emits LF even when the target file is CRLF,
 * so re-encoding the needle to the file's dominant EOL makes `includes` /
 * `split` succeed and preserves the file's line endings on write.
 */
export function applyEol(text: string, eol: Eol): string {
  const normalized = normalizeToLf(text);
  return eol === '\r\n' ? normalized.replace(/\n/g, '\r\n') : normalized;
}

/**
 * Splits text into lines tolerant of any line-ending style (`\r\n`, `\r`, or `\n`).
 *
 * Use this when parsing text that may originate from CRLF sources (e.g. unified
 * diffs generated from CRLF files on Windows) so that line content does not
 * carry a trailing carriage return.
 */
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}
