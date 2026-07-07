import { detectEol, normalizeToLf, applyEol, splitLines } from './eol_utils';

describe('detectEol', () => {
  it('returns \\n for content with only LF line endings', () => {
    expect(detectEol('line1\nline2\nline3')).toBe('\n');
  });

  it('returns \\r\\n for content with only CRLF line endings', () => {
    expect(detectEol('line1\r\nline2\r\nline3')).toBe('\r\n');
  });

  it('returns \\n for content with no line endings', () => {
    expect(detectEol('single line')).toBe('\n');
  });

  it('returns \\n for empty content', () => {
    expect(detectEol('')).toBe('\n');
  });

  it('returns the dominant ending for mixed content (CRLF majority)', () => {
    expect(detectEol('a\r\nb\r\nc\nd')).toBe('\r\n');
  });

  it('returns the dominant ending for mixed content (LF majority)', () => {
    expect(detectEol('a\nb\nc\r\nd')).toBe('\n');
  });

  it('defaults to \\n on a tie', () => {
    expect(detectEol('a\r\nb\nc')).toBe('\n');
  });
});

describe('normalizeToLf', () => {
  it('converts CRLF to LF', () => {
    expect(normalizeToLf('a\r\nb\r\nc')).toBe('a\nb\nc');
  });

  it('converts lone CR to LF', () => {
    expect(normalizeToLf('a\rb\rc')).toBe('a\nb\nc');
  });

  it('leaves LF content unchanged', () => {
    expect(normalizeToLf('a\nb\nc')).toBe('a\nb\nc');
  });

  it('handles mixed line endings', () => {
    expect(normalizeToLf('a\r\nb\nc\rd')).toBe('a\nb\nc\nd');
  });
});

describe('applyEol', () => {
  it('converts LF content to CRLF', () => {
    expect(applyEol('a\nb\nc', '\r\n')).toBe('a\r\nb\r\nc');
  });

  it('keeps LF content as LF', () => {
    expect(applyEol('a\nb\nc', '\n')).toBe('a\nb\nc');
  });

  it('re-encodes CRLF input to the requested EOL (LF)', () => {
    expect(applyEol('a\r\nb\r\nc', '\n')).toBe('a\nb\nc');
  });

  it('re-encodes mixed input to a consistent CRLF result', () => {
    expect(applyEol('a\r\nb\nc', '\r\n')).toBe('a\r\nb\r\nc');
  });
});

describe('splitLines', () => {
  it('splits LF content', () => {
    expect(splitLines('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });

  it('splits CRLF content without leaving trailing carriage returns', () => {
    expect(splitLines('a\r\nb\r\nc')).toEqual(['a', 'b', 'c']);
  });

  it('splits lone-CR content', () => {
    expect(splitLines('a\rb\rc')).toEqual(['a', 'b', 'c']);
  });

  it('splits mixed line endings', () => {
    expect(splitLines('a\r\nb\nc\rd')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns a single-element array for content with no line endings', () => {
    expect(splitLines('single line')).toEqual(['single line']);
  });
});
