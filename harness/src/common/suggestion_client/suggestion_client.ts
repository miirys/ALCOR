import { CancellationToken } from 'vscode-languageserver';
import { AdditionalContext } from '../api_types';
import { IDocContext } from '../document_transformer_service';

interface SuggestionModel {
  lang?: string;
  engine?: string;
  name?: string;
  region?: string;
  tokens_consumption_metadata?: {
    input_tokens?: number;
    output_tokens?: number;
    context_tokens_sent?: number;
    context_tokens_used?: number;
  };
}

/** We request 4 options. That's maximum supported number of Google Vertex */
export const MANUAL_REQUEST_OPTIONS_COUNT = 4;
export type OptionsCount = 1 | typeof MANUAL_REQUEST_OPTIONS_COUNT;

export const GENERATION = 'generation';
export type Intent = typeof GENERATION | 'completion' | undefined;

export interface SuggestionContext {
  document: IDocContext;
  intent?: Intent;
  projectPath?: string;
  optionsCount?: OptionsCount;
  additionalContexts?: AdditionalContext[];
}

export interface SuggestionResponse {
  choices?: SuggestionResponseChoice[];
  model?: SuggestionModel;
  status: number;
  error?: string;
  isDirectConnection?: boolean;
}

interface SuggestionResponseChoice {
  text: string;
}

export interface SuggestionClient {
  getSuggestions(
    context: SuggestionContext,
    cancellationToken: CancellationToken,
  ): Promise<SuggestionResponse | undefined>;
}
