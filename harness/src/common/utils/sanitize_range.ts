import { Range } from 'vscode-languageserver-protocol';

/**
 * This function handles a type mismatch bug in the vscode-languageserver-protocol
 * package. While the Range type definition indicates that a range is an Object
 * with two properties: start and end, at runtime, range is an array with two elements.
 *
 * This function converts the array into a proper Range object as defined by the
 * type definitions.
 *
 * TODO: Remove this function once
 * https://github.com/microsoft/vscode-languageserver-node/issues/1371 has been
 * resolved.
 *
 * @param range
 * @returns
 */
export function sanitizeRange(range: Range): Range {
  if (Array.isArray(range)) {
    return { start: range[0], end: range[1] };
  }

  return range;
}
