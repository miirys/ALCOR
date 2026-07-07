import { URI } from 'vscode-uri';

export const URL_PLACEHOLDER = '<YOUR_URL_GOES_HERE>';
const DOUBLE_SLASH = '//';

const tryParseVSCodeURI = (input: string) => {
  try {
    const sanitizedInput = input.replace(/(\\)?\s+/g, '');
    return URI.parse(sanitizedInput);
  } catch {
    return null;
  }
};

const sanitizeChunk = (chunk: string): string => {
  if (chunk.startsWith(DOUBLE_SLASH)) {
    return chunk;
  }

  const vscodeUri = tryParseVSCodeURI(chunk);

  if (vscodeUri && vscodeUri.authority) {
    return URL_PLACEHOLDER;
  }
  return chunk;
};

const replaceUrlsBetweenSeparators = (input: string, separator: string): string => {
  const chunks = input.split(separator);
  const escaped = chunks.map((chunk) => sanitizeChunk(chunk)).join(separator);

  return escaped;
};

/**
 * Replaces all valid URLs in the input string with a placeholder text.
 *
 * @param {string} input - The input string containing potential URLs.
 * @returns {string} A new string with all URLs replaced by the placeholder text.
 *
 * @example
 * const input = "$schema: https://www.example.com?foo=bar;";
 * const result = removeUrlsFromString(input);
 * console.log(result); // "$schema: <YOUR_URL_GOES_HERE>;"
 */
export function removeUrlsFromString(input: string): string {
  let result = input;
  const separators = [' ', '"', "'"];
  for (const separator of separators) {
    result = replaceUrlsBetweenSeparators(result, separator);
  }
  return result;
}
