import { createInterfaceId } from '@gitlab/needle';

export interface CodeSnippet {
  path: string;
  startLine: number;
  endLine: number;
  lines: string[];
}

export type CodeSnippetScored = [CodeSnippet, number];

export interface CodeSnippetRanker {
  rank(snippets: CodeSnippet[], queryTerms: string[], topK: number): Promise<CodeSnippetScored[]>;
}

export const CodeSnippetRanker = createInterfaceId<CodeSnippetRanker>('CodeSnippetRanker');
