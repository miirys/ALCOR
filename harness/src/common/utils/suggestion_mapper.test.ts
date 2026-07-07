import { CompletionItemKind, InlineCompletionParams, Position, Range } from 'vscode-languageserver';
import { SuggestionOptionStream } from '../api';
import { SuggestionOptionText } from '../api_types';
import { COMPLETION_PARAMS } from '../test_utils/mocks';
import { START_STREAMING_COMMAND, SUGGESTION_ACCEPTED_COMMAND } from '../constants';
import { completionOptionMapper, inlineCompletionOptionMapper } from './suggestion_mappers';

describe('completionOptionMapper', () => {
  it('should map returned suggestion to `CompletionItem`', () => {
    const uniqueTrackingId = 'testTrackingId';
    const text = 'Some suggestion text';
    const choice: SuggestionOptionText = {
      text,
      uniqueTrackingId,
    };
    const index = 0;
    const [completionItem] = completionOptionMapper([choice]);

    expect(completionItem).toEqual(
      expect.objectContaining({
        label: `GitLab Suggestion 1: ${text}`,
        kind: CompletionItemKind.Text,
        insertText: text,
        command: {
          title: 'Accept suggestion',
          command: SUGGESTION_ACCEPTED_COMMAND,
          arguments: [uniqueTrackingId],
        },
        data: {
          index,
          trackingId: uniqueTrackingId,
        },
      }),
    );
  });
});

describe('inlineCompletionOptionMapper', () => {
  const position = Position.create(1, 1);
  const inlineCompletionParams: InlineCompletionParams = {
    ...COMPLETION_PARAMS,
    context: {
      triggerKind: CompletionItemKind.Text,
    },
    position,
  };
  const uniqueTrackingId = 'testTrackingId';

  it('should map suggestion option to `InlineCompletionItem`', () => {
    const optionIdx = 1;
    const choice: SuggestionOptionText = {
      index: optionIdx,
      text: 'Choice',
      uniqueTrackingId,
    };

    const cachedTrackingId = 'cachedTrackingId';
    const cachedOptionIdx = 1;
    const cachedChoice: SuggestionOptionText = {
      index: cachedOptionIdx,
      text: 'Cached choice',
      uniqueTrackingId: cachedTrackingId,
    };

    const inlineCompletionList = inlineCompletionOptionMapper(inlineCompletionParams, [
      cachedChoice,
      choice,
    ]);

    expect(inlineCompletionList).toEqual({
      items: [
        expect.objectContaining({
          insertText: cachedChoice.text,
          range: Range.create(position, position),
          command: {
            title: 'Accept suggestion',
            command: SUGGESTION_ACCEPTED_COMMAND,
            arguments: [cachedTrackingId, cachedOptionIdx + 1],
          },
        }),
        expect.objectContaining({
          insertText: choice.text,
          range: Range.create(position, position),
          command: {
            title: 'Accept suggestion',
            command: SUGGESTION_ACCEPTED_COMMAND,
            arguments: [uniqueTrackingId, optionIdx + 1],
          },
        }),
      ],
    });
  });

  it('should map streaming suggestion option to `InlineCompletionItem`', () => {
    const choice: SuggestionOptionStream = {
      uniqueTrackingId,
      streamId: 'stream-id',
    };

    const inlineCompletionList = inlineCompletionOptionMapper(inlineCompletionParams, [choice]);

    expect(inlineCompletionList).toEqual({
      items: [
        expect.objectContaining({
          insertText: '',
          command: {
            title: 'Start streaming',
            command: START_STREAMING_COMMAND,
            arguments: ['stream-id', uniqueTrackingId],
          },
        }),
      ],
    });
  });
});
