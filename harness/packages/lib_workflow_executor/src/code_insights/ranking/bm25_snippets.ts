import { Injectable } from '@gitlab/needle';
import { CodeSnippetRanker, CodeSnippet, CodeSnippetScored } from './ranker_snippets';

type TermFreq = { [term: string]: number };
type SnippetFreq = { [term: string]: number };
type InverseSnippetFreq = { [term: string]: number };

interface BM25Index {
  termFreqs: TermFreq[];
  snipLengths: number[];
  snipFreq: SnippetFreq;
  inverseSnipFreq: InverseSnippetFreq;
}

function countOccurrences(text: string, term: string): number {
  if (!term) return 0;

  let count = 0;
  let pos = text.indexOf(term);

  while (pos !== -1) {
    count += 1;
    pos = text.indexOf(term, pos + term.length);
  }

  return count;
}

function normalizeQueryTerms(queryTerms: string[]): string[] {
  const queryTermsFiltered = queryTerms
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);

  return Array.from(new Set(queryTermsFiltered));
}

function computeIdf(
  queryTerms: string[],
  snipFreq: SnippetFreq,
  totalSnippets: number,
): InverseSnippetFreq {
  const idf: InverseSnippetFreq = {};

  for (const term of queryTerms) {
    const df = snipFreq[term] ?? 0;
    if (df === 0) {
      idf[term] = 0;
    } else {
      idf[term] = Math.log(1 + (totalSnippets - df + 0.5) / (df + 0.5));
    }
  }

  return idf;
}

function buildBM25Index(snippets: CodeSnippet[], queryTerms: string[]): BM25Index {
  const termFreqs: TermFreq[] = [];
  const snipLengths: number[] = [];
  const snipFreq: SnippetFreq = {};

  for (let i = 0; i < snippets.length; i += 1) {
    const snippet = snippets[i];
    if (snippet) {
      const text = snippet.lines.join('\n').toLowerCase();

      const tf: TermFreq = {};
      const seen: { [term: string]: true } = {};

      // snippet length always uses *all* tokens (for BM25 normalization)
      snipLengths[i] = text.length;

      for (const term of queryTerms) {
        const freq = countOccurrences(text, term);
        if (freq > 0) {
          tf[term] = freq;

          if (!seen[term]) {
            seen[term] = true;
            snipFreq[term] = (snipFreq[term] ?? 0) + 1;
          }
        }
      }

      termFreqs[i] = tf;
    }
  }

  const inverseSnipFreq = computeIdf(queryTerms, snipFreq, snippets.length);

  return { termFreqs, snipLengths, snipFreq, inverseSnipFreq };
}

function scoreSnippets(
  snippets: CodeSnippet[],
  queryTerms: string[],
  index: BM25Index,
  k1: number,
  b: number,
): CodeSnippetScored[] {
  const totalSnippets = snippets.length;
  const avgdl = index.snipLengths.reduce((sum, dl) => sum + dl, 0) / totalSnippets;

  const scored = new Array<CodeSnippetScored>(totalSnippets);

  const k1Plus1 = k1 + 1;
  const oneMinusB = 1 - b;

  for (let i = 0; i < totalSnippets; i++) {
    const tf = index.termFreqs[i];
    const dl = index.snipLengths[i];
    const snippet = snippets[i];
    if (tf && dl !== undefined && snippet) {
      let score = 0;

      for (const term of queryTerms) {
        const freq = tf[term] ?? 0;
        if (freq > 0) {
          const termIdf = index.inverseSnipFreq[term] ?? 0;
          if (termIdf > 0) {
            const denom = freq + k1 * (oneMinusB + (b * dl) / avgdl);
            score += termIdf * ((freq * k1Plus1) / denom);
          }
        }
      }

      scored[i] = [snippet, score];
    }
  }

  return scored;
}

function sortAndTrim(scored: CodeSnippetScored[], topK: number): CodeSnippetScored[] {
  scored.sort((a, b) => b[1] - a[1]);
  return scored.slice(0, topK);
}

/**
 * BM25 ranking implementation for code snippets.
 *
 * Uses the Best Matching 25 (BM25) algorithm, a probabilistic ranking function
 * commonly used in information retrieval. This implementation is optimized for
 * ranking code snippets based on search terms.
 *
 * The algorithm considers:
 * - Term frequency with saturation (controlled by k1 parameter).
 * - Document length normalization (controlled by b parameter).
 * - Inverse document frequency for term importance.
 *
 * BM25 is particularly well-suited for code search because it:
 * - Handles exact matches (common in code) while still boosting repeated terms.
 * - Normalizes for varying snippet lengths (single function vs entire class).
 * - Uses IDF to prioritize distinctive terms over common keywords.
 *
 * @see {@link https://en.wikipedia.org/wiki/Okapi_BM25} BM25 Wikipedia
 * @see Robertson & Zaragoza (2009) "The Probabilistic Relevance Framework: BM25 and Beyond"
 * @see Robertson et al. (1995) "Okapi at TREC-3" - Original BM25 paper
 */
@Injectable(CodeSnippetRanker, [])
export class BM25CodeSnippetsRanker implements CodeSnippetRanker {
  /**
   * Term frequency saturation parameter (k1).
   *
   * Controls how quickly term frequency saturates. Higher values mean term frequency
   * continues to have impact even at high frequencies, while lower values cause
   * diminishing returns more quickly.
   *
   * Standard range: 1.2 - 2.0
   * Default: 1.5 - provides good balance for code search where exact matches are common
   * but some repetition (like variable names) should still boost relevance.
   */
  readonly #k1 = 1.5;

  /**
   * Length normalization parameter (b).
   *
   * Controls document length normalization. b=0 means no length penalty, b=1 means
   * full length normalization (strongly favors shorter documents).
   *
   * Standard range: 0.0 - 1.0
   * Default: 0.75 - well-established default that provides moderate length penalty.
   * This works well for code snippets which can vary significantly in length
   * (single function vs entire class) while still allowing relevant longer snippets
   * to rank appropriately.
   */
  readonly #b = 0.75;

  async rank(
    snippets: CodeSnippet[],
    queryTerms: string[],
    topK: number,
  ): Promise<CodeSnippetScored[]> {
    if (snippets.length === 0) return [];

    const queryTermsNormalized = normalizeQueryTerms(queryTerms);
    if (queryTermsNormalized.length === 0) return [];

    const index = buildBM25Index(snippets, queryTermsNormalized);
    const scoredSnippets = scoreSnippets(snippets, queryTermsNormalized, index, this.#k1, this.#b);

    const withScore = scoredSnippets.filter((s) => s[1] > 0);
    // If snippets matched the query but all scored 0 due to IDF collapse (term appears in every
    // snippet), fall back to returning topK in original order rather than nothing.
    const anyTermMatched = index.termFreqs.some((tf) => Object.keys(tf).length > 0);
    const rankedSnippets = sortAndTrim(
      withScore.length > 0 || !anyTermMatched ? withScore : scoredSnippets,
      topK,
    );

    return Promise.resolve(rankedSnippets);
  }
}
