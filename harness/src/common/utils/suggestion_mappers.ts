import {
  CompletionItem,
  CompletionItemKind,
  InlineCompletionList,
  InlineCompletionParams,
  Range,
} from 'vscode-languageserver';
import { SuggestionOptionText } from '../api_types';
import { SuggestionOptionStream, SuggestionOption } from '../api';
import { START_STREAMING_COMMAND, SUGGESTION_ACCEPTED_COMMAND } from '../constants';
import { sanitizeRange } from './sanitize_range';

export const isStream = (o: SuggestionOption): o is SuggestionOptionStream =>
  Boolean((o as SuggestionOptionStream).streamId);
export const isTextSuggestion = (o: SuggestionOption): o is SuggestionOptionText =>
  Boolean((o as SuggestionOptionText).text);

export const completionOptionMapper = (options: SuggestionOptionText[]): CompletionItem[] =>
  options.map((option, index) => ({
    label: `GitLab Suggestion ${index + 1}: ${option.text}`,
    kind: CompletionItemKind.Text,
    insertText: option.text,
    detail: option.text,
    command: {
      title: 'Accept suggestion',
      command: SUGGESTION_ACCEPTED_COMMAND,
      arguments: [option.uniqueTrackingId],
    },
    data: {
      index,
      trackingId: option.uniqueTrackingId,
    },
  }));

/* this value will be used for telemetry so to make it human-readable
we use the 1-based indexing instead of 0 */
const getOptionTrackingIndex = (option: SuggestionOptionText) => {
  return typeof option.index === 'number' ? option.index + 1 : undefined;
};

export const inlineCompletionOptionMapper = (
  params: InlineCompletionParams,
  options: SuggestionOption[],
): InlineCompletionList => ({
  items: options.map((option) => {
    if (isStream(option)) {
      // the streaming item is empty and only indicates to the client that streaming started
      return {
        insertText: '',
        command: {
          title: 'Start streaming',
          command: START_STREAMING_COMMAND,
          arguments: [option.streamId, option.uniqueTrackingId],
        },
      };
    }
    const completionInfo = params.context.selectedCompletionInfo;
    let rangeDiff = 0;

    if (completionInfo) {
      const range = sanitizeRange(completionInfo.range);
      rangeDiff = range.end.character - range.start.character;
    }
    return {
      insertText: completionInfo
        ? `${completionInfo.text.substring(rangeDiff)}${option.text}`
        : option.text,
      range: Range.create(params.position, params.position),
      command: {
        title: 'Accept suggestion',
        command: SUGGESTION_ACCEPTED_COMMAND,
        arguments: [option.uniqueTrackingId, getOptionTrackingIndex(option)],
      },
    };
  }),
});
