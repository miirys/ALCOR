import { Edit, Language, SyntaxNode } from 'web-tree-sitter';
import type { SuggestionOptionText } from '../../../api_types';
import { PostProcessor } from '../post_processor_pipeline';
import { TreeSitterParser } from '../../../tree_sitter';
import { URL_PLACEHOLDER } from '../../../utils/sanitize_url_from_string';
import { IDocContext } from '../../../document_transformer_service';
import { StreamingCompletionResponse } from '../../../notifications';

type SanitizationResult = {
  suggestionText: string;
  edit?: Edit;
};

const SchemaKey = '$schema';

export class JsonUrlProcessor extends PostProcessor {
  #treeSitter: TreeSitterParser;

  constructor(treeSitter: TreeSitterParser) {
    super();
    this.#treeSitter = treeSitter;
  }

  #getSuggestionAbsolutePosition(context: IDocContext, suggestionText: string) {
    const startPosition = context.prefix.length;
    const endPosition = startPosition + suggestionText.length - 1;
    return {
      startPosition,
      endPosition,
    };
  }

  #getValueAbsolutePosition(nodeContent: SyntaxNode, context: IDocContext, suggestionText: string) {
    const text = `${context.prefix}${suggestionText}${context.suffix}`;
    const valueAbsoluteStartIndex =
      text.slice(nodeContent.endIndex).indexOf('"') + nodeContent.endIndex + 1;
    const valueAbsoluteEndIndex =
      text.slice(valueAbsoluteStartIndex).indexOf('"') + valueAbsoluteStartIndex;
    return {
      valueAbsoluteStartIndex,
      valueAbsoluteEndIndex,
    };
  }

  #sanitizeUrl(
    nodeContent: SyntaxNode,
    context: IDocContext,
    suggestionText: string,
  ): SanitizationResult {
    const { startIndex, endIndex } = nodeContent;
    const { startPosition: suggestionAbsoluteStartIndex, endPosition: suggestionAbsoluteEndIndex } =
      this.#getSuggestionAbsolutePosition(context, suggestionText);
    const { valueAbsoluteStartIndex, valueAbsoluteEndIndex } = this.#getValueAbsolutePosition(
      nodeContent,
      context,
      suggestionText,
    );

    if (
      valueAbsoluteEndIndex <= suggestionAbsoluteStartIndex ||
      valueAbsoluteStartIndex >= suggestionAbsoluteEndIndex
    ) {
      return {
        suggestionText,
      };
    }

    const suggestionStartIndex = Math.max(
      valueAbsoluteStartIndex - suggestionAbsoluteStartIndex,
      0,
    );
    const suggestionEndIndex = Math.min(
      valueAbsoluteEndIndex - suggestionAbsoluteStartIndex,
      suggestionText.length - 1,
    );

    const newSuggestionText =
      suggestionText.slice(0, suggestionStartIndex) +
      URL_PLACEHOLDER +
      suggestionText.slice(suggestionEndIndex);

    const newEndIndex = startIndex + newSuggestionText.length;
    const offset = newSuggestionText.length - suggestionText.length;
    const edit: Edit = {
      startIndex,
      oldEndIndex: endIndex,
      newEndIndex,
      startPosition: nodeContent.startPosition,
      oldEndPosition: nodeContent.endPosition,
      newEndPosition: {
        row: nodeContent.endPosition.row,
        column: nodeContent.endPosition.column + offset,
      },
    };
    return {
      suggestionText: newSuggestionText,
      edit,
    };
  }

  #findSchemaNodes(node: SyntaxNode, language: Language): SyntaxNode[] {
    const result = [];

    if (node.type !== 'object') {
      const nodes = node.children
        .map((childNode) => this.#findSchemaNodes(childNode, language))
        .flat();
      result.push(...nodes);
    } else {
      for (const childNode of node.children) {
        if (childNode.type === 'pair') {
          const keyNode = childNode.childForFieldName('key');
          if (keyNode?.text.includes(SchemaKey)) {
            result.push(keyNode);
          }
        }

        if (childNode.type === 'ERROR') {
          const keyNode = childNode.children.find((n) => n.text.includes(SchemaKey));
          if (keyNode) {
            result.push(keyNode);
          }
        }
      }
    }

    return result;
  }

  async #getSanitizedCompletion(context: IDocContext, suggestionText: string) {
    const parsingResult = await this.#treeSitter.parseFile({ ...context, suggestionText });

    if (!parsingResult) {
      return suggestionText;
    }
    let { tree } = parsingResult;

    let commentNodes = this.#findSchemaNodes(tree.rootNode, parsingResult.language);

    if (commentNodes.length <= 0) {
      return suggestionText;
    }

    let sanitizationResult: SanitizationResult = {
      suggestionText: suggestionText || '',
    };

    // we iterate through all found comment nodes.
    // if sanitization changed the suggestion text, we update the tree to keep
    // the correct start/end index of each comment node
    for (let i = 0; i < commentNodes.length; i++) {
      sanitizationResult = this.#sanitizeUrl(
        commentNodes[i],
        context,
        sanitizationResult.suggestionText,
      );
      if (sanitizationResult.edit) {
        tree.edit(sanitizationResult.edit);
        tree = parsingResult.parser.parse(
          `${context.prefix}${sanitizationResult.suggestionText}${context.suffix}`,
        );
        commentNodes = this.#findSchemaNodes(tree.rootNode, parsingResult.language);
      }
    }

    return sanitizationResult.suggestionText;
  }

  async processStream(
    context: IDocContext,
    input: StreamingCompletionResponse,
  ): Promise<StreamingCompletionResponse> {
    const completion = await this.#getSanitizedCompletion(context, input.completion || '');

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
      const text = await this.#getSanitizedCompletion(context, option.text);
      return { ...option, text };
    });

    const result = await Promise.all(parsingPromises);

    return result;
  }
}
