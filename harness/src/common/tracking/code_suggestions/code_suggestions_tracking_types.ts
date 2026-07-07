import { InlineCompletionTriggerKind } from 'vscode-languageserver';
import { SuggestionSource, CODE_SUGGESTIONS_TRACKING_EVENTS } from '@gitlab-org/config';
import { IDocContext } from '../../document_transformer_service';
import { AdditionalContext, SuggestionOptionText } from '../../api_types';

export interface ICodeSuggestionContextUpdate {
  documentContext: IDocContext;
  branchName?: string;
  source: SuggestionSource;
  isStreaming: boolean;
  model: ICodeSuggestionModel;
  region: string;
  status: number;
  debounceInterval: number;
  gitlab_global_user_id: string;
  gitlab_instance_id: string;
  gitlab_host_name: string;
  gitlab_saas_duo_pro_namespace_ids: number[];
  isInvoked: boolean;
  optionsCount: number;
  acceptedOption: number;
  triggerKind: InlineCompletionTriggerKind;
  additionalContexts: AdditionalContext[];
  isDirectConnection: boolean;
  suggestionOptions: SuggestionOptionText[];
}

export interface ICodeSuggestionModel {
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

export type CodeSuggestionsTelemetryEvent = CODE_SUGGESTIONS_TRACKING_EVENTS;

type UniqueTrackingId = string;

export type CodeSuggestionsTelemetryEventContext = UniqueTrackingId;

export interface CodeSuggestionsTelemetryTrackingContext {
  uniqueTrackingId: UniqueTrackingId;
  context: Partial<ICodeSuggestionContextUpdate>;
}
