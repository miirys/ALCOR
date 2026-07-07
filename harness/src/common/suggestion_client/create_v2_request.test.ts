import { createFakePartial } from '@gitlab-org/test-utils';
import { IDocContext } from '../document_transformer_service';
import { createV2Request } from './create_v2_request';
import { SuggestionContext } from './suggestion_client';

describe('createV2Request', () => {
  it('should create a valid CodeSuggestionRequest', () => {
    const suggestionContext = createFakePartial<SuggestionContext>({
      projectPath: 'my-project',
      document: createFakePartial<IDocContext>({
        prefix: 'console.log("hello")',
        suffix: 'console.log("world")',
        fileRelativePath: 'src/common/suggestion_client/create_v2_request.ts',
      }),
      optionsCount: 4,
      intent: 'generation',
      additionalContexts: [
        {
          content: 'aaa',
          name: 'file.js',
          type: 'file',
          resolution_strategies: ['open_tabs' as const],
        },
      ],
    });

    const request = createV2Request(suggestionContext);

    expect(request).toEqual({
      prompt_version: 1,
      project_path: 'my-project',
      project_id: -1,
      current_file: {
        content_above_cursor: 'console.log("hello")',
        content_below_cursor: 'console.log("world")',
        file_name: 'src/common/suggestion_client/create_v2_request.ts',
      },
      choices_count: 4,
      intent: 'generation',
      context: [
        { content: 'aaa', name: 'file.js', type: 'file', resolution_strategies: ['open_tabs'] },
      ],
    });
  });
});
