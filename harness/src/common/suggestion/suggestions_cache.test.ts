import { DefaultConfigService } from '@gitlab-org/config';
import { SuggestionOptionText } from '../api_types';
import { ICodeSuggestionContextUpdate } from '../tracking/code_suggestions/code_suggestions_tracking_types';
import { SuggestionCacheContext, SuggestionsCache } from './suggestions_cache';

describe('suggestions cache', () => {
  const additionalContexts = [
    {
      content: 'somecontent',
      name: 'file1',
      type: 'file' as const,
      resolution_strategies: ['open_tabs' as const],
    },
  ];

  const mockEntry: {
    request: SuggestionCacheContext;
    suggestions: SuggestionOptionText[];
    suggestionContext: Partial<ICodeSuggestionContextUpdate>;
  } = {
    request: {
      document: { uri: 't1' },
      context: {
        fileRelativePath: 'demo',
        prefix: `line-minus-2
        last-line-before-empty

        current = `,
        suffix: `line-plus-1
        line-plus-2`,
        position: { line: 20, character: 10 },
        uri: 'file:///demo',
        languageId: 'javascript',
      },
      position: { line: 20, character: 10 },
      additionalContexts,
    },
    suggestions: [
      { text: 'pending-text-1', uniqueTrackingId: 't1' },
      {
        text: 'other-pending-text-2',
        uniqueTrackingId: 't2',
        model: {
          engine: 'engine',
          lang: 'javascript',
          name: 'name',
          tokens_consumption_metadata: {
            input_tokens: 100,
            output_tokens: 10,
          },
        },
      },
    ],
    suggestionContext: {
      branchName: 'branch-of-amazingness',
    },
  };

  let suggestionsCache: SuggestionsCache;
  let configService: DefaultConfigService;

  beforeEach(() => {
    configService = new DefaultConfigService();
    configService.set('suggestionsCache', {
      enabled: true,
    });
    suggestionsCache = new SuggestionsCache(configService);

    suggestionsCache.addToSuggestionCache(mockEntry);
  });

  it('retrieves cached suggestions when input matches', () => {
    const cache = suggestionsCache.getCachedSuggestions(mockEntry.request);

    expect(cache?.options).toHaveLength(2);
  });

  it('ignores suggestion when line number differs', () => {
    const cache = suggestionsCache.getCachedSuggestions({
      ...mockEntry.request,
      position: {
        ...mockEntry.request.position,
        line: mockEntry.request.position.line + 1,
      },
    });

    expect(cache).toBeUndefined();
  });

  it('retrieves correct suggestions when input added matches', () => {
    const EXTRA = 'p';
    const cache = suggestionsCache.getCachedSuggestions({
      ...mockEntry.request,
      context: {
        ...mockEntry.request.context,
        prefix: `${mockEntry.request.context.prefix}${EXTRA}`,
      },
      position: {
        ...mockEntry.request.position,
        character: mockEntry.request.position.character + EXTRA.length,
      },
    });

    expect(cache?.options).toHaveLength(1);
    expect(cache?.options.at(0)?.text).toBe('ending-text-1');
  });

  it('generates correct tracking id for telemetry purposes', () => {
    const EXTRA = 'p';
    const cache = suggestionsCache.getCachedSuggestions({
      ...mockEntry.request,
      context: {
        ...mockEntry.request.context,
        prefix: `${mockEntry.request.context.prefix}${EXTRA}`,
      },
      position: {
        ...mockEntry.request.position,
        character: mockEntry.request.position.character + EXTRA.length,
      },
    });

    expect(cache?.options.at(0)?.uniqueTrackingId).toBeDefined();
    expect(cache?.options.at(0)?.uniqueTrackingId).not.toBe('t1');
  });

  it('does not retrieves suggestions when input added matches but cache is disabled in config', () => {
    const EXTRA = 'p';

    configService.set('suggestionsCache', {
      enabled: false,
    });

    const cache = suggestionsCache.getCachedSuggestions({
      ...mockEntry.request,
      context: {
        ...mockEntry.request.context,
        prefix: `${mockEntry.request.context.prefix}${EXTRA}`,
      },
      position: {
        ...mockEntry.request.position,
        character: mockEntry.request.position.character + EXTRA.length,
      },
    });

    expect(cache).toBeUndefined();
  });

  it('retrieves no suggestions when input different from all suggestions', () => {
    const EXTRA = 'n';
    const cache = suggestionsCache.getCachedSuggestions({
      ...mockEntry.request,
      context: {
        ...mockEntry.request.context,
        prefix: `${mockEntry.request.context.prefix}${EXTRA}`,
      },
      position: {
        ...mockEntry.request.position,
        character: mockEntry.request.position.character + EXTRA.length,
      },
    });

    expect(cache?.options).toHaveLength(0);
  });

  it('retrieves no suggestions when irrelevant line changed', () => {
    const cache = suggestionsCache.getCachedSuggestions({
      ...mockEntry.request,
      context: {
        ...mockEntry.request.context,
        prefix: `line-minus-2
        last-line-before-empty-RELEVANT-LINE-CHANGED

        current = p`,
      },
      position: {
        ...mockEntry.request.position,
        character: mockEntry.request.position.character + 1,
      },
    });

    expect(cache).toBeUndefined();
  });

  it('discards suggestions when relevant line changed', () => {
    const cache = suggestionsCache.getCachedSuggestions({
      ...mockEntry.request,
      context: {
        ...mockEntry.request.context,
        prefix: `line-minus-2-IRRELEVANT_LINE-CHANGED
        last-line-before-empty

        current = p`,
      },
      position: {
        ...mockEntry.request.position,
        character: mockEntry.request.position.character + 1,
      },
    });

    expect(cache?.options).toHaveLength(1);
    expect(cache?.options.at(0)?.text).toBe('ending-text-1');
  });

  it('drops suggestions if current line differs', () => {
    const cache = suggestionsCache.getCachedSuggestions({
      ...mockEntry.request,
      context: {
        ...mockEntry.request.context,
        prefix: `line-minus-2
        last-line-before-empty

        CHANGED = p`,
      },
      position: {
        ...mockEntry.request.position,
        character: mockEntry.request.position.character + 1,
      },
    });

    expect(cache?.options).toHaveLength(0);
  });

  it('drops suggestions if current line differs', () => {
    const cache = suggestionsCache.getCachedSuggestions({
      ...mockEntry.request,
      context: {
        ...mockEntry.request.context,
        prefix: `line-minus-2
        last-line-before-empty

        CHANGED = p`,
      },
      position: {
        ...mockEntry.request.position,
        character: mockEntry.request.position.character + 1,
      },
    });

    expect(cache?.options).toHaveLength(0);
  });

  it('drops suggestions if current line is shorter than cached', () => {
    const cache = suggestionsCache.getCachedSuggestions({
      ...mockEntry.request,
      context: {
        ...mockEntry.request.context,
        prefix: `line-minus-2
        last-line-before-empty

        cur`,
      },
      position: {
        ...mockEntry.request.position,
        character: mockEntry.request.position.character + 1,
      },
    });

    expect(cache?.options).toHaveLength(0);
  });

  describe('for suggestions that are retrieved twice', () => {
    it('when the position is not the same, the entry is not deleted', () => {
      const requestWithDifferentPosition = {
        ...mockEntry.request,
        position: {
          ...mockEntry.request.position,
          character: mockEntry.request.position.character + 1,
        },
      };
      const firstSuggestion = suggestionsCache.getCachedSuggestions(mockEntry.request);
      const secondSuggestion = suggestionsCache.getCachedSuggestions(requestWithDifferentPosition);

      expect(firstSuggestion?.options).toHaveLength(2);
      expect(secondSuggestion?.options).toHaveLength(2);
    });

    it('when the position is the same, the entry is deleted', () => {
      const firstSuggestion = suggestionsCache.getCachedSuggestions(mockEntry.request);
      const secondSuggestion = suggestionsCache.getCachedSuggestions(mockEntry.request);

      expect(firstSuggestion?.options).toHaveLength(2);
      expect(secondSuggestion).toBeUndefined();
    });
  });

  describe('suggestion model data', () => {
    const modelCases = [
      { engine: 'Engine' },
      { name: 'Model' },
      { lang: 'typescript' },
      { engine: 'Engine', name: 'Model', lang: 'python' },
      {
        engine: 'Engine',
        name: 'Model',
        lang: 'ruby',
        tokens_consumption_metadata: {
          input_tokens: 100,
          output_tokens: 10,
        },
      },
      {},
      undefined,
    ];

    it.each(modelCases)('should cache suggestion with model data for $model', (model) => {
      // Create a new suggestions cache
      suggestionsCache = new SuggestionsCache(configService);
      suggestionsCache.addToSuggestionCache({
        request: mockEntry.request,
        suggestions: [
          {
            ...mockEntry.suggestions[0],
            model,
          },
        ],
        suggestionContext: {
          branchName: 'branch-of-amazingness',
        },
      });

      const cache = suggestionsCache.getCachedSuggestions(mockEntry.request);

      expect(cache?.options.at(0)?.model).toBe(model);
    });
  });

  describe('saves additionalContexts used to request the suggestion', () => {
    it('saves the suggestion language when provided', () => {
      const cache = suggestionsCache.getCachedSuggestions(mockEntry.request);
      expect(cache?.additionalContexts).toEqual(additionalContexts);
    });
  });

  describe('saves suggestionContext associated with the suggestion', () => {
    it('saves the suggestion branchName when provided', () => {
      const cache = suggestionsCache.getCachedSuggestions(mockEntry.request);
      expect(cache?.suggestionContext?.branchName).toEqual('branch-of-amazingness');
    });
  });
});
