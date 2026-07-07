import { AIContextItem, AIContextProviderType } from '@gitlab-org/ai-context';
import { InstanceFeatureFlags, FeatureFlagService } from '@gitlab-org/core';
import { createFakePartial } from '@gitlab-org/test-utils';
import { ConfigService } from '@gitlab-org/config';
import { AdditionalContext } from '../api_types';
import { shouldUseOpenTabs, aiContextItemsToRequestBody } from './helpers';
import { CodeSuggestionsAIContextItem } from './pre_processors/pre_processor_pipeline';

describe('shouldUseAdvancedContext', () => {
  const featureFlagService = createFakePartial<FeatureFlagService>({
    isInstanceFlagEnabled: jest.fn(),
  });
  const configService = createFakePartial<ConfigService>({
    get: jest.fn(),
  });

  describe.each`
    isEditorAdvancedContextEnabled | isGenericContextEnabled | isEditorOpenTabsContextEnabled | expected
    ${true}                        | ${true}                 | ${true}                        | ${true}
    ${true}                        | ${true}                 | ${undefined}                   | ${true}
    ${false}                       | ${true}                 | ${false}                       | ${false}
    ${true}                        | ${false}                | ${false}                       | ${false}
    ${false}                       | ${false}                | ${true}                        | ${false}
    ${false}                       | ${false}                | ${false}                       | ${false}
  `(
    'when EditorAdvancedContext feature flag is "$isEditorAdvancedContextEnabled" and CodeSuggestionsContext feature flag is "$isGenericContextEnabled" and EditorOpenTabsContext is "$isEditorOpenTabsContextEnabled"',
    ({
      isEditorAdvancedContextEnabled,
      isGenericContextEnabled,
      isEditorOpenTabsContextEnabled,
      expected,
    }) => {
      it(`should return ${expected}`, () => {
        jest.mocked(featureFlagService.isInstanceFlagEnabled).mockImplementation((flag) => {
          switch (flag) {
            case InstanceFeatureFlags.EditorAdvancedContext:
              return isEditorAdvancedContextEnabled;
            case InstanceFeatureFlags.CodeSuggestionsContext:
              return isGenericContextEnabled;
            default:
              return false;
          }
        });
        jest.mocked(configService.get).mockImplementation((key) => {
          switch (key) {
            case 'client.openTabsContext':
              return isEditorOpenTabsContextEnabled;
            default:
              return true;
          }
        });
        expect(shouldUseOpenTabs(featureFlagService, configService)).toBe(expected);
      });
    },
  );
});

describe('aiContextItemsToRequestBody', () => {
  describe('for AIContextItem[] input', () => {
    function createMockAIContextItem(id: string, subType: AIContextProviderType, content?: string) {
      return createFakePartial<AIContextItem>({
        id,
        content,
        category: 'file',
        metadata: {
          subType,
        },
      } as AIContextItem);
    }

    it('should transform the context items correctly', () => {
      const mockAIContextItems = [
        createMockAIContextItem('file-a', 'import', 'some content'),
        createMockAIContextItem('file-b', 'open_tab', undefined),
      ];

      const transformedItems = aiContextItemsToRequestBody(mockAIContextItems);
      expect(transformedItems).toEqual([
        {
          type: 'file',
          name: 'file-a',
          content: 'some content',
          resolution_strategies: ['imports'],
        } as AdditionalContext,
        {
          type: 'file',
          name: 'file-b',
          content: '',
          resolution_strategies: ['open_tabs'],
        } as AdditionalContext,
      ]);
    });
  });

  describe('for CodeSuggestionsAIContextItem[] input', () => {
    function createMockCodeSuggestionsAIContextItem(
      id: string,
      subType: AIContextProviderType,
      allSources: AIContextProviderType[],
      content?: string,
    ) {
      return createFakePartial<CodeSuggestionsAIContextItem>({
        id,
        content,
        category: 'file',
        metadata: {
          subType,
          allSources,
        },
      } as CodeSuggestionsAIContextItem);
    }

    it('should transform the context items correctly', () => {
      const mockAIContextItems = [
        createMockCodeSuggestionsAIContextItem(
          'file-a',
          'import',
          ['import', 'dependency'],
          'some content',
        ),
        createMockCodeSuggestionsAIContextItem(
          'file-b',
          'open_tab',
          ['open_tab', 'import'],
          undefined,
        ),
      ];

      const transformedItems = aiContextItemsToRequestBody(mockAIContextItems);
      expect(transformedItems).toEqual([
        {
          type: 'file',
          name: 'file-a',
          content: 'some content',
          resolution_strategies: ['imports'],
        } as AdditionalContext,
        {
          type: 'file',
          name: 'file-b',
          content: '',
          resolution_strategies: ['open_tabs', 'imports'],
        } as AdditionalContext,
      ]);
    });
  });
});
