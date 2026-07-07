import { sliceFileContent, buildPaginationMessage } from './file_slicing';

describe('sliceFileContent', () => {
  const content = 'line0\nline1\nline2\nline3\nline4';

  it('returns full content with default limit when neither offset nor limit is provided', () => {
    const result = sliceFileContent(content);

    expect(result.content).toBe(content);
    expect(result.truncated).toBe(false);
    expect(result.totalLines).toBe(5);
  });

  it('slices from offset to default limit when only offset is provided', () => {
    const result = sliceFileContent(content, 2);

    expect(result.content).toBe('line2\nline3\nline4');
    expect(result.truncated).toBe(false);
  });

  it('slices first N lines when only limit is provided', () => {
    const result = sliceFileContent(content, undefined, 3);

    expect(result.content).toBe('line0\nline1\nline2');
    expect(result.truncated).toBe(true);
    expect(result.lastLineIndex).toBe(2);
  });

  it('slices N lines from offset when both are provided', () => {
    const result = sliceFileContent(content, 1, 2);

    expect(result.content).toBe('line1\nline2');
    expect(result.truncated).toBe(true);
  });

  describe('when offset exceeds line count', () => {
    it('returns empty content', () => {
      const result = sliceFileContent(content, 100);

      expect(result.content).toBe('');
    });

    it('clamps lastLineIndex to the last valid line index', () => {
      const result = sliceFileContent(content, 100);

      expect(result.lastLineIndex).toBe(4); // totalLines - 1
    });
  });

  it('returns remaining lines when limit exceeds available lines', () => {
    const result = sliceFileContent(content, 3, 100);

    expect(result.content).toBe('line3\nline4');
    expect(result.truncated).toBe(false);
  });

  it('returns empty string for offset 0 and limit 0', () => {
    const result = sliceFileContent(content, 0, 0);

    expect(result.content).toBe('');
  });

  it('handles empty content', () => {
    const result = sliceFileContent('', 0, 10);

    expect(result.content).toBe('');
  });

  it('handles single line content', () => {
    const result = sliceFileContent('only line', 0, 1);

    expect(result.content).toBe('only line');
  });

  describe('byte budget', () => {
    it('stops collecting lines when output would exceed 50 KB', () => {
      // Each line is ~100 bytes, so 600 lines ≈ 60 KB which exceeds the 50 KB budget
      const lines = Array.from({ length: 600 }, (_, i) => `${'x'.repeat(99)}${i}`);
      const bigContent = lines.join('\n');

      const result = sliceFileContent(bigContent, 0, 600);

      expect(result.truncated).toBe(true);
      expect(result.content.length).toBeLessThan(51 * 1024);
      expect(result.content.split('\n').length).toBeLessThan(600);
    });
  });
});

describe('buildPaginationMessage', () => {
  it('returns empty string when not truncated', () => {
    const message = buildPaginationMessage({
      content: 'anything',
      truncated: false,
      totalLines: 5,
      lastLineIndex: 4,
      startOffset: 0,
    });

    expect(message).toBe('');
  });

  it('returns pagination hint when truncated', () => {
    const message = buildPaginationMessage({
      content: 'anything',
      truncated: true,
      totalLines: 100,
      lastLineIndex: 19,
      startOffset: 0,
    });

    expect(message).toContain('Showing lines 1-20 of 100 total');
    expect(message).toContain('Use offset=20 to continue reading');
  });

  it('uses correct line numbers when offset is non-zero', () => {
    const message = buildPaginationMessage({
      content: 'anything',
      truncated: true,
      totalLines: 100,
      lastLineIndex: 49,
      startOffset: 30,
    });

    expect(message).toContain('Showing lines 31-50 of 100 total');
    expect(message).toContain('Use offset=50 to continue reading');
  });
});
