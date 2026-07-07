import { BM25CodeSnippetsRanker } from './bm25_snippets';
import { CodeSnippet } from './ranker_snippets';

describe('BM25CodeSnippetsRanker', () => {
  let ranker: BM25CodeSnippetsRanker;

  beforeEach(() => {
    ranker = new BM25CodeSnippetsRanker();
  });

  const createSnippet = (path: string, lines: string[]): CodeSnippet => ({
    path,
    startLine: 1,
    endLine: lines.length,
    lines,
  });

  const getSnippets = (results: [CodeSnippet, number][]) => results.map(([snippet]) => snippet);
  const getScores = (results: [CodeSnippet, number][]) => results.map(([, score]) => score);

  it.each([
    ['empty snippets array', [], ['test']],
    ['empty query terms', [createSnippet('file.ts', ['test'])], []],
    ['whitespace-only query terms', [createSnippet('file.ts', ['test'])], ['  ', '\t', '']],
    ['no matching snippets', [createSnippet('file.ts', ['test'])], ['nonexistent']],
    ['empty snippet lines', [createSnippet('empty.ts', [''])], ['test']],
    ['topK of 0', [createSnippet('file.ts', ['test'])], ['test'], 0],
  ])('returns empty array for %s', async (_desc, snippets, queryTerms, topK = 10) => {
    const result = await ranker.rank(snippets, queryTerms, topK);
    expect(result).toEqual([]);
  });

  it('returns snippet with score when single snippet matches', async () => {
    const snippet = createSnippet('file.ts', ['function test() {', '  return true;', '}']);
    const result = await ranker.rank([snippet], ['test'], 10);

    expect(result).toHaveLength(1);
    const [returnedSnippet, score] = result[0];
    expect(returnedSnippet).toEqual(snippet);
    expect(score).toBeGreaterThan(0);
  });

  it('ranks snippets by relevance score', async () => {
    const snippets = [
      createSnippet('low.ts', ['// test mentioned once', 'const x = 1;']),
      createSnippet('high.ts', ['function test() {', '  test();', '  return test;']),
      createSnippet('medium.ts', ['const test = true;', 'export { test };']),
    ];

    const result = await ranker.rank(snippets, ['test'], 10);
    const paths = getSnippets(result).map((s) => s.path);
    const [score1, score2, score3] = getScores(result);

    expect(paths).toEqual(['high.ts', 'medium.ts', 'low.ts']);
    expect(score1).toBeGreaterThan(score2);
    expect(score2).toBeGreaterThan(score3);
  });

  it('returns only top K results when topK is less than matches', async () => {
    const snippets = [
      createSnippet('file1.ts', ['test test test']),
      createSnippet('file2.ts', ['test test']),
      createSnippet('file3.ts', ['test']),
      createSnippet('file4.ts', ['test']),
    ];

    const result = await ranker.rank(snippets, ['test'], 2);
    const paths = getSnippets(result).map((s) => s.path);

    expect(result).toHaveLength(2);
    expect(paths).toEqual(['file1.ts', 'file2.ts']);
  });

  it('returns all results when topK is greater than matches', async () => {
    const snippets = [createSnippet('file1.ts', ['test']), createSnippet('file2.ts', ['test'])];

    const result = await ranker.rank(snippets, ['test'], 10);

    expect(result).toHaveLength(2);
  });

  it('ranks snippets matching multiple terms higher', async () => {
    const snippets = [
      createSnippet('both.ts', ['function test() {', '  return result;']),
      createSnippet('one.ts', ['function test() {}']),
      createSnippet('other.ts', ['const result = true;']),
    ];

    const result = await ranker.rank(snippets, ['test', 'result'], 10);
    const [topSnippet, topScore] = result[0];
    const [score2, score3] = getScores(result).slice(1);

    expect(topSnippet.path).toBe('both.ts');
    expect(topScore).toBeGreaterThan(score2);
    expect(topScore).toBeGreaterThan(score3);
  });

  it('deduplicates query terms', async () => {
    const snippet = createSnippet('file.ts', ['function test() {}']);

    const result1 = await ranker.rank([snippet], ['test', 'test', 'test'], 10);
    const result2 = await ranker.rank([snippet], ['test'], 10);
    const [, score1] = result1[0];
    const [, score2] = result2[0];

    expect(score1).toBe(score2);
  });

  it('trims whitespace from query terms', async () => {
    const snippet = createSnippet('file.ts', ['function test() {}']);

    const result = await ranker.rank([snippet], ['  test  ', '\ttest\t'], 10);
    const [, score] = result[0];

    expect(result).toHaveLength(1);
    expect(score).toBeGreaterThan(0);
  });

  it('penalizes longer documents for same term frequency', async () => {
    const snippets = [
      createSnippet('short.ts', ['test']),
      createSnippet('long.ts', ['test with lots of additional content that makes this longer']),
    ];

    const result = await ranker.rank(snippets, ['test'], 10);
    const [topSnippet, topScore] = result[0];
    const [, secondScore] = result[1];

    expect(topSnippet.path).toBe('short.ts');
    expect(topScore).toBeGreaterThan(secondScore);
  });

  it('handles term frequency saturation', async () => {
    const snippets = [
      createSnippet('freq-1.ts', ['test']),
      createSnippet('freq-2.ts', ['test test']),
      createSnippet('freq-10.ts', ['test test test test test test test test test test']),
    ];

    const result = await ranker.rank(snippets, ['test'], 10);
    const [score10, score2, score1] = getScores(result);

    const scoreDiff1to2 = score2 - score1;
    const scoreDiff2to10 = score10 - score2;
    expect(scoreDiff2to10).toBeLessThan(scoreDiff1to2 * 5);
  });

  describe('when all snippets contain the query term (IDF collapse)', () => {
    it('falls back to returning snippets in original order instead of empty', async () => {
      // When every snippet contains the term, IDF → 0 and all scores are 0.
      // The ranker should return topK snippets rather than nothing.
      const snippets = [
        createSnippet('a.ts', ['constructor() {}']),
        createSnippet('b.ts', ['constructor(private x: string) {}']),
        createSnippet('c.ts', ['constructor(private x: string, private y: number) {}']),
      ];

      const result = await ranker.rank(snippets, ['constructor'], 2);

      expect(result).toHaveLength(2);
      expect(result[0][0].path).toBe('a.ts');
      expect(result[1][0].path).toBe('b.ts');
    });
  });

  it('preserves original snippet objects', async () => {
    const snippet: CodeSnippet = {
      path: 'file.ts',
      startLine: 10,
      endLine: 20,
      lines: ['test line 1', 'test line 2'],
    };

    const result = await ranker.rank([snippet], ['test'], 10);
    const [returnedSnippet] = result[0];

    expect(returnedSnippet).toBe(snippet);
    expect(returnedSnippet).toMatchObject({
      path: 'file.ts',
      startLine: 10,
      endLine: 20,
      lines: ['test line 1', 'test line 2'],
    });
  });
});
