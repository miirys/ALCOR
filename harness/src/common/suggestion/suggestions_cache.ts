import { TextDocumentIdentifier, Position } from 'vscode-languageserver-protocol';
import { LRUCache } from 'lru-cache';
import { ConfigService, ISuggestionsCacheOptions } from '@gitlab-org/config';
import { AdditionalContext, SuggestionOptionText } from '../api_types';
import { IDocContext } from '../document_transformer_service';
import { ICodeSuggestionContextUpdate } from '../tracking/code_suggestions/code_suggestions_tracking_types';
import { generateUniqueTrackingId } from '../tracking/code_suggestions/utils';

type TimesRetrievedByPosition = {
  [key: string]: number;
};

export type SuggestionCacheEntry = {
  character: number;
  suggestions: SuggestionOptionText[];
  additionalContexts?: AdditionalContext[];
  currentLine: string;
  timesRetrievedByPosition: TimesRetrievedByPosition;
  suggestionContext: Partial<ICodeSuggestionContextUpdate>;
};

export type SuggestionCacheContext = {
  document: TextDocumentIdentifier;
  context: IDocContext;
  position: Position;
  additionalContexts?: AdditionalContext[];
};

export type SuggestionCache = {
  options: SuggestionOptionText[];
  additionalContexts?: AdditionalContext[];
  suggestionContext: Partial<ICodeSuggestionContextUpdate>;
};

function isNonEmptyLine(s: string) {
  return s.trim().length > 0;
}

type Required<T> = {
  [P in keyof T]-?: T[P];
};

const DEFAULT_CONFIG: Required<ISuggestionsCacheOptions> = {
  enabled: true,
  maxSize: 1024 * 1024,
  ttl: 60 * 1000,
  prefixLines: 1,
  suffixLines: 1,
};
export class SuggestionsCache {
  #cache: LRUCache<string, SuggestionCacheEntry>;

  #configService: ConfigService;

  constructor(configService: ConfigService) {
    this.#configService = configService;
    const currentConfig = this.#getCurrentConfig();

    this.#cache = new LRUCache<string, SuggestionCacheEntry>({
      ttlAutopurge: true,
      sizeCalculation: (value, key) =>
        value.suggestions.reduce((acc, suggestion) => acc + suggestion.text.length, 0) + key.length,
      ...DEFAULT_CONFIG,
      ...currentConfig,
      ttl: Number(currentConfig.ttl),
    });
  }

  #getCurrentConfig(): Required<ISuggestionsCacheOptions> {
    return {
      ...DEFAULT_CONFIG,
      ...(this.#configService.get('suggestionsCache') ?? {}),
    };
  }

  #getSuggestionKey(ctx: SuggestionCacheContext) {
    const prefixLines = ctx.context.prefix.split('\n');

    const currentLine = prefixLines.pop() ?? '';
    const indentation = (currentLine.match(/^\s*/)?.[0] ?? '').length;

    const config = this.#getCurrentConfig();

    const cachedPrefixLines = prefixLines
      .filter(isNonEmptyLine)
      .slice(-config.prefixLines)
      .join('\n');
    const cachedSuffixLines = ctx.context.suffix
      .split('\n')
      .filter(isNonEmptyLine)
      .slice(0, config.suffixLines)
      .join('\n');

    return [
      ctx.document.uri,
      ctx.position.line,
      cachedPrefixLines,
      cachedSuffixLines,
      indentation,
    ].join(':');
  }

  #increaseCacheEntryRetrievedCount(suggestionKey: string, character: number) {
    const item = this.#cache.get(suggestionKey);
    if (item && item.timesRetrievedByPosition) {
      item.timesRetrievedByPosition[character] =
        (item.timesRetrievedByPosition[character] ?? 0) + 1;
    }
  }

  addToSuggestionCache(config: {
    request: SuggestionCacheContext;
    suggestions: SuggestionOptionText[];
    suggestionContext: Partial<ICodeSuggestionContextUpdate>;
  }) {
    if (!this.#getCurrentConfig().enabled) {
      return;
    }

    const currentLine = config.request.context.prefix.split('\n').at(-1) ?? '';
    this.#cache.set(this.#getSuggestionKey(config.request), {
      character: config.request.position.character,
      suggestions: config.suggestions,
      currentLine,
      timesRetrievedByPosition: {},
      additionalContexts: config.request.additionalContexts,
      suggestionContext: config.suggestionContext,
    });
  }

  getCachedSuggestions(request: SuggestionCacheContext): SuggestionCache | undefined {
    if (!this.#getCurrentConfig().enabled) {
      return undefined;
    }

    const currentLine = request.context.prefix.split('\n').at(-1) ?? '';
    const key = this.#getSuggestionKey(request);
    const candidate = this.#cache.get(key);

    if (!candidate) {
      return undefined;
    }

    const { character } = request.position;
    if (candidate.timesRetrievedByPosition[character] > 0) {
      // If cache has already returned this suggestion from the same position before, discard it.
      this.#cache.delete(key);

      return undefined;
    }

    this.#increaseCacheEntryRetrievedCount(key, character);

    const options = candidate.suggestions
      .map((s) => {
        const currentLength = currentLine.length;
        const previousLength = candidate.currentLine.length;
        const diff = currentLength - previousLength;

        if (diff < 0) {
          return null;
        }

        if (diff >= s.text.length) {
          return null;
        }

        if (
          currentLine.slice(0, previousLength) !== candidate.currentLine ||
          s.text.slice(0, diff) !== currentLine.slice(previousLength)
        ) {
          return null;
        }

        return {
          ...s,
          text: s.text.slice(diff),
          uniqueTrackingId: generateUniqueTrackingId(),
        };
      })
      .filter((x): x is SuggestionOptionText => Boolean(x));

    return {
      options,
      additionalContexts: candidate.additionalContexts,
      suggestionContext: candidate.suggestionContext,
    };
  }
}
