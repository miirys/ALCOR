import { sanitizeRange } from './sanitize_range';

describe('utils/sanitizeRange', () => {
  it.each`
    input                                                                   | output
    ${[{ line: 1, character: 1 }, { line: 1, character: 2 }]}               | ${{ start: { line: 1, character: 1 }, end: { line: 1, character: 2 } }}
    ${{ start: { line: 1, character: 1 }, end: { line: 1, character: 2 } }} | ${{ start: { line: 1, character: 1 }, end: { line: 1, character: 2 } }}
  `('converts $input to $output', ({ input, output }) => {
    expect(sanitizeRange(input)).toEqual(output);
  });
});
