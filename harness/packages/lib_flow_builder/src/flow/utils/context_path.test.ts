import {
  buildContextPath,
  parseContextPath,
  parseReferencePath,
  replaceContextPathRoot,
} from './context_path';

describe('parseContextRef', () => {
  it('parses a dotted context path', () => {
    expect(parseContextPath('context:abc-123.findings')).toEqual({
      root: 'abc-123',
      field: 'findings',
    });
  });

  it('parses a bare context path (no field)', () => {
    expect(parseContextPath('context:goal')).toEqual({
      root: 'goal',
      field: undefined,
    });
  });

  it('captures everything after the first dot as field (multi-dot)', () => {
    expect(parseContextPath('context:a.b.c')).toEqual({
      root: 'a',
      field: 'b.c',
    });
  });

  it('returns undefined for non-context paths', () => {
    expect(parseContextPath('status:ok')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(parseContextPath('')).toBeUndefined();
  });

  it('reconstructed body matches original slice behavior', () => {
    const paths = ['context:goal', 'context:project_name.title', 'context:a.b.c'];
    for (const path of paths) {
      const ref = parseContextPath(path)!;
      const body = ref.field ? `${ref.root}.${ref.field}` : ref.root;
      expect(body).toBe(path.slice('context:'.length));
    }
  });
});

describe('buildContextPath', () => {
  it('builds a path with field', () => {
    expect(buildContextPath('node-1', 'answer')).toBe('context:node-1.answer');
  });

  it('builds a bare path without field', () => {
    expect(buildContextPath('goal', undefined)).toBe('context:goal');
  });
});

describe('parseReferencePath', () => {
  it('parses a dotted context path', () => {
    expect(parseReferencePath('context:analyzer.findings')).toEqual({
      prefix: 'context',
      root: 'analyzer',
      field: 'findings',
    });
  });

  it('parses a bare context path', () => {
    expect(parseReferencePath('context:goal')).toEqual({
      prefix: 'context',
      root: 'goal',
      field: undefined,
    });
  });

  it('parses a status path', () => {
    expect(parseReferencePath('status:analyzer')).toEqual({
      prefix: 'status',
      root: 'analyzer',
      field: undefined,
    });
  });

  it('parses a dotted status path', () => {
    expect(parseReferencePath('status:analyzer.completed')).toEqual({
      prefix: 'status',
      root: 'analyzer',
      field: 'completed',
    });
  });

  it('returns undefined for paths without a known prefix', () => {
    expect(parseReferencePath('analyzer.findings')).toBeUndefined();
    expect(parseReferencePath('')).toBeUndefined();
  });

  it('returns undefined for prefix-only inputs (no root)', () => {
    expect(parseReferencePath('context:')).toBeUndefined();
    expect(parseReferencePath('status:')).toBeUndefined();
  });
});

describe('replaceContextRefRoot', () => {
  it('replaces root in a dotted path', () => {
    expect(replaceContextPathRoot('context:old.field', 'new')).toBe('context:new.field');
  });

  it('replaces root in a bare path', () => {
    expect(replaceContextPathRoot('context:bare', 'new')).toBe('context:new');
  });

  it('passes through non-context paths unchanged', () => {
    expect(replaceContextPathRoot('not-context', 'x')).toBe('not-context');
  });

  it('preserves multi-dot fields', () => {
    expect(replaceContextPathRoot('context:old.a.b', 'new')).toBe('context:new.a.b');
  });
});
