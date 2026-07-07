export type ResolutionStrategy = 'open_tabs' | 'imports';

export type AdditionalContext = {
  /**
   * The type of the context element. Options: `file` or `snippet`.
   */
  type: 'file' | 'snippet';
  /**
   * The name of the context element. A name of the file or a code snippet.
   */
  name: string;
  /**
   * The content of the context element. The body of the file or a function.
   */
  content: string;
  /**
   * The list of all sources where the context was derived from
   */
  resolution_strategies: ResolutionStrategy[];
};

interface ISuggestionOptionModel {
  lang?: string;
  engine?: string;
  name?: string;
  tokens_consumption_metadata?: {
    input_tokens?: number;
    output_tokens?: number;
    context_tokens_sent?: number;
    context_tokens_used?: number;
  };
}

export interface SuggestionOptionText {
  index?: number;
  text: string;
  uniqueTrackingId: string;
  model?: ISuggestionOptionModel;
}

export type GitLabProjectId = number;
