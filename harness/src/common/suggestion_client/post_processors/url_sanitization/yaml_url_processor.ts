import type { SuggestionOptionText } from '../../../api_types';
import { IDocContext } from '../../../document_transformer_service';
import { StreamingCompletionResponse } from '../../../notifications';
import { URL_PLACEHOLDER } from '../../../utils/sanitize_url_from_string';
import { PostProcessor } from '../post_processor_pipeline';

const SchemaKey = '$schema';

const isSchemaComment = (line: string): boolean => {
  const commentInlineIndex = line.indexOf('#');
  if (commentInlineIndex >= 0) {
    const commentText = line.slice(commentInlineIndex);
    return commentText.includes(SchemaKey);
  }
  return false;
};

type LineRange = {
  line: string;
  startIndex: number;
  endIndex: number;
};

const convertToLineRanges = (combinedLines: string): LineRange[] => {
  let startIndex = 0;
  let endIndex = 0;
  const result = [];
  for (const line of combinedLines.split('\n')) {
    endIndex = Math.max(startIndex + line.length, 0);
    result.push({
      line,
      startIndex,
      endIndex,
    });
    startIndex = endIndex + 1; // account for new line symbol
  }

  return result;
};

const sanitizeLine = (
  suggestionText: string,
  suggestionStartIndex: number,
  lineRange: LineRange,
) => {
  const { line, startIndex, endIndex } = lineRange;

  const suggestionEndIndex = suggestionStartIndex + suggestionText.length - 1;
  const commentEndIndexInSuggestion = Math.min(endIndex - suggestionStartIndex, suggestionEndIndex);
  if (!(endIndex <= suggestionStartIndex || startIndex >= suggestionEndIndex)) {
    const schemaKeyPositionInLine = line.indexOf(SchemaKey);
    const urlStartPosition = Math.max(
      startIndex -
        suggestionStartIndex +
        schemaKeyPositionInLine +
        line.slice(schemaKeyPositionInLine).indexOf('=') +
        1,
      0,
    );
    const sanitizedSuggestion =
      suggestionText.slice(0, urlStartPosition) +
      URL_PLACEHOLDER +
      suggestionText.slice(commentEndIndexInSuggestion);

    return sanitizedSuggestion;
  }
  return suggestionText;
};

export class YamlUrlProcessor extends PostProcessor {
  #getSanitizedCompletion(context: IDocContext, suggestionText: string): string {
    if (!suggestionText) {
      return suggestionText;
    }

    // we're going to find all the comment lines here that intersect with suggestion text
    // that means, we're only interested in the last line of the prefix and the first line of suffix
    const lastPrefixLine = context.prefix.split('\n').pop();
    const firstSuffixLine = context.suffix.split('\n')[0];

    const combinedLines = `${lastPrefixLine}${suggestionText}${firstSuffixLine}`;

    const commentLineRanges = convertToLineRanges(combinedLines).filter((lineRange) =>
      isSchemaComment(lineRange.line),
    );

    const suggestionStartIndex = lastPrefixLine?.length || 0;

    let sanitizedSuggestion = suggestionText;
    let indexOffsetAfterEdit = 0; // if we edited the suggestion text, we need to shift further lines to this offset
    for (const lineRange of commentLineRanges) {
      const suggestionLength = sanitizedSuggestion.length;
      lineRange.startIndex += indexOffsetAfterEdit;
      lineRange.endIndex += indexOffsetAfterEdit;

      sanitizedSuggestion = sanitizeLine(sanitizedSuggestion, suggestionStartIndex, lineRange);
      indexOffsetAfterEdit = indexOffsetAfterEdit + sanitizedSuggestion.length - suggestionLength;
    }
    return sanitizedSuggestion;
  }

  async processStream(
    context: IDocContext,
    input: StreamingCompletionResponse,
  ): Promise<StreamingCompletionResponse> {
    const completion = this.#getSanitizedCompletion(context, input.completion || '');

    return {
      ...input,
      completion,
    };
  }

  async processCompletion(
    context: IDocContext,
    input: SuggestionOptionText[],
  ): Promise<SuggestionOptionText[]> {
    const parsingPromises = input.map(async (option) => {
      const text = this.#getSanitizedCompletion(context, option.text);
      return { ...option, text };
    });

    const result = await Promise.all(parsingPromises);

    return result;
  }
}
