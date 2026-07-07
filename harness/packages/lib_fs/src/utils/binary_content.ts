import { URI } from 'vscode-uri';
import { FsClient } from '../fs_client';

export const BINARY_CHECK_BYTES = 8192;

/**
 * Checks if a file contains binary content by examining its first bytes.
 * @throws {NodeJS.ErrnoException} If the file does not exist or cannot be accessed (ENOENT, EPERM, EACCES, etc.)
 */
export async function isBinaryFile(uri: URI, fsClient: FsClient): Promise<boolean> {
  const { stat, readFileFirstBytes } = fsClient.promises;

  await stat(uri.fsPath);

  try {
    const content = await readFileFirstBytes(uri.fsPath, BINARY_CHECK_BYTES);

    // File content was successfully decoded as an utf-8 string, but in Node+Browser this is "best effort", so the text
    // content we have may actually be rubbish. So now we check it for known control characters or null bytes
    return isBinaryContent(content);
  } catch {
    // If we can't read it as text at all, it's probably binary
    return true;
  }
}

export function isBinaryContent(content: string): boolean {
  if (
    content.startsWith('\uFEFF') || // UTF-8 BOM
    content.startsWith('\uFFFE') // UTF-16 LE BOM
  ) {
    return false;
  }

  if (content.startsWith('%PDF-')) {
    return true;
  }

  /* eslint-disable no-control-regex */
  const NULL_BYTE_REGEX = /\x00/;
  const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;
  /* eslint-enable no-control-regex */

  const contentToCheck = content.slice(0, BINARY_CHECK_BYTES);
  return NULL_BYTE_REGEX.test(contentToCheck) || CONTROL_CHARS_REGEX.test(contentToCheck);
}
