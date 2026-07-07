import { z } from 'zod';
import { createInterfaceId } from '@gitlab/needle';
import { AIContextItem, AIContextProviderType } from '@gitlab-org/ai-context';
import { DuoCodeSuggestionsContext } from '@gitlab-org/duo-feature-access';
import { IDocContext } from '../document_transformer_service';
import { TreeAndLanguage } from '../tree_sitter';

/**
 * Methods that use this request type are used to get the context items that are relevant for the given document context.
 *
 * Primary use at this time is Code Suggestions.
 *
 * This method should not include a context item that is the same as the iDocContext.
 *
 * So if the iDocContext is file://path/to/file.ts, we should not include a context item that is the same file.
 *
 * @param {IDocContext} iDocContext - The `IDocContext` of the document
 * @param {Tree} tree - The tree AST of the `iDocContext` document, parsed by `web-tree-sitter`
 * @deprecated - TODO: We are going to redesign the overall architecture to be modular at the feature level,
 * see https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/752#note_2310700284
 */
export const CodeSuggestionsAIRequest = z.object({
  iDocContext: IDocContext,
  treeAndLanguage: z.custom<TreeAndLanguage>().optional(),
});

export type CodeSuggestionsAIRequest = z.infer<typeof CodeSuggestionsAIRequest>;

export interface SuggestionContextProvider<T extends AIContextItem = AIContextItem> {
  type: AIContextProviderType;
  suggestionsRequiredFeature: DuoCodeSuggestionsContext;
  searchSuggestionContextItems: (query: CodeSuggestionsAIRequest) => Promise<T[]>;
  addContentToItems: (aiContextItems: T[]) => Promise<T[]>;
}

// Generic AIContextProvider interface ID cannot handle contravariant parameters and covariant returns properly in DI registration
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SuggestionContextProvider = createInterfaceId<SuggestionContextProvider<any>>(
  'SuggestionContextProvider',
);
