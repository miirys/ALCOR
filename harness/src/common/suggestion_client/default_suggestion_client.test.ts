import { createFakePartial } from '@gitlab-org/test-utils';
import { CancellationToken } from 'vscode-languageserver';
import { CodeSuggestionResponse, GitLabApiClient } from '../api';
import { IDocContext } from '../document_transformer_service';
import { SuggestionContext } from './suggestion_client';
import { DefaultSuggestionClient } from './default_suggestion_client';

const TEST_SUGGESTION_RESPONSE = createFakePartial<CodeSuggestionResponse>({
  choices: [],
});
const TEST_CONTEXT: SuggestionContext = {
  document: createFakePartial<IDocContext>({
    fileRelativePath: 'test.md',
    prefix: 'prefix-content',
    suffix: 'suffix-content',
  }),
  projectPath: 'gitlab-org/editor-extensions/gitlab-lsp',
};

describe('DefaultSuggestionClient', () => {
  let api: GitLabApiClient;
  let subject: DefaultSuggestionClient;
  let cancellationToken: CancellationToken;

  beforeEach(() => {
    api = createFakePartial<GitLabApiClient>({
      getCodeSuggestions: jest.fn().mockResolvedValue(TEST_SUGGESTION_RESPONSE),
    });
    cancellationToken = createFakePartial<CancellationToken>({
      isCancellationRequested: false,
    });

    subject = new DefaultSuggestionClient(api);
  });

  describe('getSuggestions', () => {
    it('passes through to monolith api', async () => {
      const result = await subject.getSuggestions(TEST_CONTEXT, cancellationToken);

      expect(result).toEqual(expect.objectContaining(TEST_SUGGESTION_RESPONSE));
      expect(api.getCodeSuggestions).toHaveBeenCalledWith(
        {
          prompt_version: 1,
          project_path: TEST_CONTEXT.projectPath,
          project_id: -1,
          current_file: {
            content_above_cursor: 'prefix-content',
            content_below_cursor: 'suffix-content',
            file_name: 'test.md',
          },
        },
        cancellationToken,
      );
    });

    it('passes through intent if provided', async () => {
      await subject.getSuggestions(
        {
          ...TEST_CONTEXT,
          intent: 'completion',
        },
        cancellationToken,
      );

      expect(api.getCodeSuggestions).toHaveBeenCalledWith(
        expect.objectContaining({
          intent: 'completion',
        }),
        cancellationToken,
      );
    });

    it('adds isDirectConnection: false to the response', async () => {
      const result = await subject.getSuggestions(TEST_CONTEXT, cancellationToken);

      expect(result).toEqual(expect.objectContaining({ isDirectConnection: false }));
    });
  });
});
